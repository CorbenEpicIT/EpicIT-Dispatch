/**
 * recomputeDocumentTotals.ts
 *
 * Shared tax recomputation logic for both quotes and invoices.
 * Single source of truth — eliminates the near-identical functions that
 * previously existed in invoiceService.ts (recomputeInvoiceTotals) and
 * quotesController.ts (recomputeQuoteTotals).
 */
import { Prisma } from "../../generated/prisma/client.js";
import {
	calculateDocumentTax,
	centsToDollars,
} from "../services/taxEngine.js";
import {
	resolveLineItemTaxInputs,
	type DocumentLineItemRaw,
} from "./taxHelpers.js";

export type DocumentModel = "invoice" | "quote";

/**
 * Recompute all tax/discount/total fields for a quote or invoice.
 *
 * - If the document does not exist, returns `false`.
 * - If `tax_snapshot` is already set (locked), skips and returns `false`.
 * - Otherwise, updates all line item `tax_amount` fields and the document
 *   totals, then returns `true`.
 *
 * Invoice-only: also updates `balance_due`.
 *
 * @param model         "invoice" | "quote"
 * @param documentId    Primary key of the document
 * @param organizationId  Required for org-scoped tax group resolution
 * @param tx            Prisma transaction client — caller must wrap in $transaction
 * @param lockedAt      When provided, the tax snapshot is locked with this timestamp
 */
export async function recomputeDocumentTotals(
	model: DocumentModel,
	documentId: string,
	organizationId: string,
	tx: Prisma.TransactionClient,
	lockedAt?: Date,
): Promise<boolean> {
	// ── 1. Fetch document fields needed for tax calculation ──────────────────
	const lineItemSelect = {
		select: {
			id: true,
			total: true,
			tax_group_id: true,
			taxable: true,
		},
	};

	// Fetch from the correct model, including amount_paid for invoices
	let doc: {
		client_id: string;
		tax_snapshot: Prisma.JsonValue | null;
		discount_type: string | null;
		discount_value: Prisma.Decimal | null;
		amount_paid?: Prisma.Decimal | null;
		line_items: Array<{
			id: string;
			total: Prisma.Decimal;
			tax_group_id: string | null;
			taxable: boolean;
		}>;
	} | null = null;

	if (model === "invoice") {
		doc = await tx.invoice.findFirst({
			where: { id: documentId },
			select: {
				client_id: true,
				tax_snapshot: true,
				discount_type: true,
				discount_value: true,
				amount_paid: true,
				line_items: lineItemSelect,
			},
		});
	} else {
		doc = await tx.quote.findFirst({
			where: { id: documentId },
			select: {
				client_id: true,
				tax_snapshot: true,
				discount_type: true,
				discount_value: true,
				line_items: lineItemSelect,
			},
		});
	}

	if (!doc) return false;
	if (doc.tax_snapshot != null) {
		const snap = doc.tax_snapshot as { locked_at?: string };
		// Only skip recompute if the snapshot is locked (ISO timestamp). A "draft" sentinel
		// means the snapshot exists but is unlocked and may be recomputed freely.
		if (snap.locked_at !== "draft") return false;
	}

	// ── 2. Resolve tax inputs for each line item ─────────────────────────────
	const rawItems: DocumentLineItemRaw[] = doc.line_items.map((li) => ({
		id: li.id,
		total: Number(li.total),
		tax_group_id: li.tax_group_id,
		taxable: li.taxable,
	}));

	const { inputs, clientExempt } = await resolveLineItemTaxInputs(
		rawItems,
		doc.client_id,
		organizationId,
		tx,
	);

	// ── 3. Calculate tax ─────────────────────────────────────────────────────
	const taxOutput = calculateDocumentTax(
		{
			line_items: inputs,
			discount_type: (doc.discount_type as "percent" | "amount") ?? null,
			discount_value: doc.discount_value ? Number(doc.discount_value) : null,
		},
		clientExempt,
		lockedAt,
	);

	// ── 4. Write per-line-item tax amounts ───────────────────────────────────
	// Use a Map for O(1) lookup (avoids O(n²) .find inside the loop).
	const inputMap = new Map(inputs.map((i) => [i.id, i]));
	const lineItemUpdate = model === "invoice"
		? (id: string, data: Parameters<typeof tx.invoice_line_item.update>[0]["data"]) =>
			tx.invoice_line_item.update({ where: { id }, data })
		: (id: string, data: Parameters<typeof tx.quote_line_item.update>[0]["data"]) =>
			tx.quote_line_item.update({ where: { id }, data });

	// Parallelise all updates — they are independent within the transaction.
	await Promise.all(
		rawItems.map((li) => {
			const taxAmountCents = taxOutput.line_item_tax_amounts[li.id] ?? 0;
			const resolvedInput = inputMap.get(li.id);
			return lineItemUpdate(li.id, {
				tax_amount: centsToDollars(taxAmountCents),
				taxable: resolvedInput?.taxable ?? li.taxable,
				tax_group_id: resolvedInput?.tax_group?.id ?? li.tax_group_id ?? null,
			});
		}),
	);

	// ── 5. Write document-level totals ───────────────────────────────────────
	const subtotal = centsToDollars(taxOutput.subtotal_cents);
	const taxAmount = centsToDollars(taxOutput.total_tax_cents);
	const discountAmount = centsToDollars(taxOutput.discount_cents);
	const total = centsToDollars(taxOutput.total_cents);

	const sharedData = {
		subtotal,
		tax_rate: taxOutput.effective_rate,
		tax_amount: taxAmount,
		discount_amount: discountAmount,
		total,
		// Always persist snapshot — locked_at is "draft" for unlocked docs, ISO string once issued.
		// TaxSnapshot is a plain object of JSON-safe primitives; double cast is required
		// because Prisma's InputJsonValue index signature is incompatible with named types.
		tax_snapshot: taxOutput.snapshot as unknown as Prisma.InputJsonValue,
	};

	if (model === "invoice") {
		const balanceDue = Math.max(0, total - Number(doc.amount_paid ?? 0));
		await tx.invoice.update({
			where: { id: documentId },
			data: { ...sharedData, balance_due: balanceDue },
		});
	} else {
		await tx.quote.update({
			where: { id: documentId },
			data: sharedData,
		});
	}

	return true;
}

/**
 * Lock the tax snapshot on an invoice or quote when it transitions to Issued.
 * If the snapshot is already set, this is a no-op.
 */
export async function lockDocumentTaxSnapshot(
	model: DocumentModel,
	documentId: string,
	organizationId: string,
	tx: Prisma.TransactionClient,
	lockedAt: Date = new Date(),
): Promise<void> {
	await recomputeDocumentTotals(model, documentId, organizationId, tx, lockedAt);
}
