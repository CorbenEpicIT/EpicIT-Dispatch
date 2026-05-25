import { useMemo } from "react";
import type { ReactNode } from "react";
import { FileText } from "lucide-react";
import Card from "../ui/Card";
import { formatCurrency } from "../../util/util";
import { formatRatePercentLabel } from "../../lib/formatTax";
import type { TaxSnapshot, TaxSnapshotRate } from "../../types/tax";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface FinancialSummaryLineItemRate {
	id: string;
	name: string;
	rate: number;
}

export interface FinancialSummaryLineItem {
	id?: string | null;
	name: string;
	description?: string | null;
	item_type?: string | null;
	quantity: number | string;
	unit_price: number | string;
	/** Pre-computed row total. Falls back to quantity × unit_price when absent. */
	total?: number | string | null;
	tax_group?: {
		name: string;
		/** Rates fallback when taxSnapshot absent. */
		rates?: { tax_rate: FinancialSummaryLineItemRate }[];
	} | null;
	/** Per-item tax amount (dollars); fallback when taxSnapshot absent. */
	tax_amount?: number | null;
	taxable?: boolean;
}

export interface FinancialSummaryProps {
	lineItems: FinancialSummaryLineItem[];

	// Financials
	taxSnapshot?: TaxSnapshot | null;
	/** Legacy flat-rate fallback (pre-snapshot records only). */
	legacyTaxRate?: number | null;
	legacyTaxAmount?: number | null;
	subtotal?: number | null;
	discountAmount?: number | null;
	discountType?: string | null;
	discountValue?: number | null;

	// Right sidebar meta card
	/** Label for the document identifier — e.g. "Quote #", "Job Number", "Visit Date". */
	metaLabel: string;
	/** Value for the document identifier — e.g. "Q-001", "J-042", "May 21, 2026". */
	metaValue: string;

	/** Page-specific total card(s) rendered below the divider in the right sidebar. */
	totalsContent: ReactNode;

	// Card config
	cardTitle?: string;

	// Empty-state strings
	noLineItemsTitle?: string;
	noLineItemsDescription?: string;
}

// ── Internal types ─────────────────────────────────────────────────────────────

interface CollapsedRate {
	id: string;
	name: string;
	rate: number;
	amountCents: number;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function FinancialSummary({
	lineItems,
	taxSnapshot,
	legacyTaxRate,
	legacyTaxAmount,
	subtotal,
	discountAmount,
	discountType,
	discountValue,
	metaLabel,
	metaValue,
	totalsContent,
	cardTitle = "Financial Summary",
	noLineItemsTitle = "No Line Items",
	noLineItemsDescription = "No line items have been added yet.",
}: FinancialSummaryProps) {
	// group name → rates; snapshot is primary, line-item tax_group is fallback.
	const groupRatesMap = useMemo(() => {
		const map = new Map<string, TaxSnapshotRate[]>();
		for (const group of taxSnapshot?.groups ?? []) {
			if ((group.rates ?? []).length > 0) map.set(group.name, group.rates);
		}
		if (map.size === 0) {
			for (const item of lineItems) {
				const g = item.tax_group;
				if (g?.name && g.rates && g.rates.length > 0 && !map.has(g.name)) {
					map.set(g.name, g.rates.map(r => ({
						id: r.tax_rate.id,
						name: r.tax_rate.name,
						rate: r.tax_rate.rate,
					})));
				}
			}
		}
		return map;
	}, [taxSnapshot, lineItems]);

	// Deduplicate by rate ID across groups, summing amounts. Drops group names for display.
	const collapsedTaxRates = useMemo((): CollapsedRate[] => {
		if (!taxSnapshot) return [];
		const rateMap = new Map<string, CollapsedRate>();
		for (const group of taxSnapshot.groups ?? []) {
			for (const rate of group.rates ?? []) {
				const cents = Math.round(rate.rate * (group.taxable_amount_cents ?? 0));
				const entry = rateMap.get(rate.id);
				if (entry) {
					entry.amountCents += cents;
				} else {
					rateMap.set(rate.id, {
						id: rate.id,
						name: rate.name,
						rate: rate.rate,
						amountCents: cents,
					});
				}
			}
		}
		return [...rateMap.values()];
	}, [taxSnapshot]);

	// No snapshot — per-rate totals from line items; split tax_amount by rate weight.
	const lineItemCollapsedRates = useMemo((): CollapsedRate[] => {
		if (collapsedTaxRates.length > 0) return [];
		const rateMap = new Map<string, CollapsedRate>();
		for (const item of lineItems) {
			if (!item.taxable || item.tax_amount == null || !item.tax_group?.rates?.length) continue;
			const itemTaxCents = Math.round(Number(item.tax_amount) * 100);
			if (itemTaxCents === 0) continue;
			const combinedRate = item.tax_group.rates.reduce((s, r) => s + r.tax_rate.rate, 0);
			if (combinedRate === 0) continue;
			for (const r of item.tax_group.rates) {
				const share = Math.round(itemTaxCents * (r.tax_rate.rate / combinedRate));
				const existing = rateMap.get(r.tax_rate.id);
				if (existing) {
					existing.amountCents += share;
				} else {
					rateMap.set(r.tax_rate.id, {
						id: r.tax_rate.id,
						name: r.tax_rate.name,
						rate: r.tax_rate.rate,
						amountCents: share,
					});
				}
			}
		}
		return [...rateMap.values()];
	}, [collapsedTaxRates, lineItems]);

	return (
		<Card title={cardTitle}>
			<div className="grid grid-cols-1 lg:grid-cols-3 gap-8">

				{/* ── Left column — line items table ───────────────────────────── */}
				<div className="lg:col-span-2">
					<h3 className="text-text-tertiary text-xs uppercase tracking-wide font-semibold mb-4">
						Line Items
					</h3>

					{lineItems.length === 0 ? (
						<div className="text-center py-8">
							<FileText size={40} className="mx-auto text-text-faint mb-3" />
							<h3 className="text-text-tertiary text-sm font-medium mb-1">
								{noLineItemsTitle}
							</h3>
							<p className="text-text-muted text-xs">{noLineItemsDescription}</p>
						</div>
					) : (
						<div>
							{/* Header row */}
							<div className="grid grid-cols-12 gap-2 pb-2 border-b border-border text-xs uppercase tracking-wide font-semibold text-text-tertiary">
								<div className="col-span-5 min-w-0">Item / Description</div>
								<div className="col-span-2 min-w-0 text-center">Type</div>
								<div className="col-span-1 min-w-0 text-right">Qty</div>
								<div className="col-span-2 min-w-0 text-right">Unit Price</div>
								<div className="col-span-2 min-w-0 text-right">Amount</div>
							</div>

							{/* Data rows */}
							{lineItems.map((item, index) => {
								const rowTotal =
									item.total != null
										? Number(item.total)
										: Number(item.quantity) * Number(item.unit_price);
								return (
									<div
										key={item.id ?? index}
										className="border-b border-border-subtle hover:bg-surface/30 transition-colors"
									>
										{/* Primary row */}
										<div className="grid grid-cols-12 gap-2 pt-3 pb-1 items-center">
											<div className="col-span-5 min-w-0 text-sm">
												<p className="text-white font-medium break-words">
													{item.name}
												</p>
											</div>
											<div className="col-span-2 min-w-0 flex justify-center">
												{item.item_type && (
													<span className="inline-block max-w-full truncate px-1.5 py-0.5 rounded text-xs font-medium bg-surface-raised text-text-secondary border border-border-strong">
														{item.item_type}
													</span>
												)}
											</div>
											<div
												className="col-span-1 min-w-0 text-right text-sm text-white tabular-nums"
												title={String(item.quantity)}
											>
												{Number(item.quantity).toLocaleString("en-US", {
													minimumFractionDigits: 0,
													maximumFractionDigits: 2,
												})}
											</div>
											<div className="col-span-2 min-w-0 text-right text-sm text-white tabular-nums">
												{formatCurrency(Number(item.unit_price))}
											</div>
											<div className="col-span-2 min-w-0 text-right text-sm text-white font-semibold tabular-nums">
												{formatCurrency(rowTotal)}
											</div>
										</div>

										{/* Sub-row: description + tax badge */}
										<div className="space-y-1 pb-2.5 min-w-0">
											{item.description && (
												<p className="text-xs text-text-tertiary leading-relaxed break-words">
													{item.description}
												</p>
											)}
											<div className="flex flex-wrap items-center gap-1.5">
												{item.tax_group?.name ? (
													<span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-surface-raised/60 border border-border-strong/50 text-[10px] font-medium text-text-muted whitespace-nowrap leading-none">
														{item.tax_group.name}
														{groupRatesMap.has(item.tax_group.name)
															? ` · ${groupRatesMap
																.get(item.tax_group.name)!
																.map(r => `${r.name} ${formatRatePercentLabel(r.rate)}`)
																.join(" + ")}`
															: ""}
													</span>
												) : (
													<span className="inline-flex items-center px-1.5 py-0.5 rounded bg-surface-raised/40 border border-border-strong/30 text-[10px] text-text-faint whitespace-nowrap leading-none">
														No Tax
													</span>
												)}
											</div>
										</div>
									</div>
								);
							})}
						</div>
					)}
				</div>

				{/* ── Right column — sidebar summary ───────────────────────────── */}
				<div className="lg:col-span-1 space-y-6">

					{/* Meta: item count + document identifier */}
					<div className="p-4 bg-surface/50 rounded-lg border border-border">
						<div className="flex items-start justify-between gap-4">
							<div>
								<p className="text-2xl font-bold text-white tabular-nums leading-none">
									{lineItems.length}
								</p>
								<p className="text-[10px] text-text-tertiary uppercase tracking-wide font-semibold mt-1">
									Line Items
								</p>
							</div>
							<div className="text-right min-w-0">
								<p className="text-[10px] text-text-tertiary uppercase tracking-wide font-semibold">
									{metaLabel}
								</p>
								<p className="text-sm font-medium text-white mt-1 break-all">
									{metaValue}
								</p>
							</div>
						</div>
					</div>

					{/* Financial lines */}
					<div className="space-y-3">
						{subtotal != null && (
							<div className="flex items-center justify-between text-sm">
								<span className="text-text-tertiary">Subtotal:</span>
								<span className="text-white font-medium tabular-nums">
									{formatCurrency(subtotal)}
								</span>
							</div>
						)}

						{/* Tax — collapsed per-rate rows, or line-item fallback, or legacy flat-rate */}
						{(() => {
							const rates = collapsedTaxRates.length > 0 ? collapsedTaxRates : lineItemCollapsedRates;
							const totalTaxCents = rates.reduce((s, r) => s + r.amountCents, 0);

							if (rates.length > 0) {
								return (
									<>
										{rates.map(rate => (
											<div key={rate.id} className="flex items-center justify-between text-sm">
												<span className="text-text-tertiary">
													{rate.name} ({formatRatePercentLabel(rate.rate)}):
												</span>
												<span className="text-white font-medium tabular-nums">
													{formatCurrency(rate.amountCents / 100)}
												</span>
											</div>
										))}
										{rates.length > 1 && (
											<div className="flex items-center justify-between text-sm">
												<span className="text-text-tertiary font-medium">Total Tax:</span>
												<span className="text-white font-medium tabular-nums">
													{formatCurrency(totalTaxCents / 100)}
												</span>
											</div>
										)}
									</>
								);
							}
							if (legacyTaxAmount != null && Number(legacyTaxAmount) > 0) {
								return (
									<div className="flex items-center justify-between text-sm">
										<span className="text-text-tertiary">
											Tax{legacyTaxRate != null ? ` (${formatRatePercentLabel(Number(legacyTaxRate))})` : ""}:
										</span>
										<span className="text-white font-medium tabular-nums">
											{formatCurrency(Number(legacyTaxAmount))}
										</span>
									</div>
								);
							}
							return null;
						})()}

						{discountAmount != null && Number(discountAmount) > 0 && (
							<div className="flex items-center justify-between text-sm">
								<span className="text-text-tertiary">
									Discount
									{discountType === "percent" && discountValue
										? ` (${Number(discountValue)}%)`
										: ""}
									:
								</span>
								<span className="text-success-text font-medium tabular-nums">
									-{formatCurrency(Number(discountAmount))}
								</span>
							</div>
						)}

						<div className="border-t border-border my-2" />

						{totalsContent}
					</div>
				</div>
			</div>
		</Card>
	);
}
