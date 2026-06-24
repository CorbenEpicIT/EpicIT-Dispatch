import { getScopedDb } from "../../lib/context.js";
import { qbFetch, getOrgRealmId } from "../quickbooksService.js";
import { httpError, ErrorCodes } from "../../types/responses.js";
import { pushInvoice } from "./qbInvoices.js"
import { logExternalSync } from "./qbSyncLog.js"


/** QuickBooks reference object, e.g. CustomerRef / AccountRef. */
export interface QBRef {
    value: string;
    name?: string;
}

export interface QBMetaData {
    CreateTime: string;
    LastUpdatedTime: string;
}

/** A linked transaction on a payment line (e.g. the invoice the payment
 is applied to). */
export interface QBLinkedTxn {
    TxnId: string;
    TxnType: string; // "Invoice", "CreditMemo", etc.
}

export interface QBPaymentLine {
    Amount: number;
    LinkedTxn: QBLinkedTxn[];
}

export interface QBPayment {
    Id: string;
    SyncToken: string;
    domain: string; // "QBO"
    sparse: boolean;
    TxnDate: string;
    TotalAmt: number;
    UnappliedAmt: number;
    ProcessPayment: boolean;
    CustomerRef: QBRef;
    DepositToAccountRef?: QBRef;
    ProjectRef?: QBRef;
    Line: QBPaymentLine[];
    MetaData: QBMetaData;
}

/** Response wrapper returned by GET/POST on the QB Payment entity. */
export interface QBPaymentResponse {
    Payment: QBPayment;
    time: string;
}

const inFlightPushes = new Map<string, Promise<void>>();

export async function pushPaymentToQB(paymentId: string, organizationId: string) {
    const prior = inFlightPushes.get(paymentId) ?? Promise.resolve();
	const run = prior.catch(() => {}).then(() => doPushPaymentToQB(paymentId, organizationId));
	inFlightPushes.set(
		paymentId,
		run.finally(() => {
			if (inFlightPushes.get(paymentId) === run) {
				inFlightPushes.delete(paymentId);
			}
		})
	);
	return run;
}

async function doPushPaymentToQB(paymentId: string, organizationId: string) {
    const sdb = getScopedDb(organizationId);
    const accountId = await getOrgRealmId(organizationId);
    let payment = await sdb.invoice_payment.findFirst({
        where: { id: paymentId },
        include: {
            invoice: {
                include: {
                    client: {
                        include: { client_external_mapping: { where: { provider: "quickbooks", account_id: accountId } } }
                    }
                }
            }
        },
    });

    if (!payment) {
        throw httpError(404, ErrorCodes.NOT_FOUND, "Payment not found");
    }
    if (payment.qb_payment_id) {
        // Already pushed — idempotent no-op (echo-guard), not an error.
        return;
    }
    if (!payment.invoice) {
        throw httpError(400, ErrorCodes.BAD_REQUEST, "Invoice not found");
    }
    if (!payment.invoice.qb_invoice_id || payment.invoice.account_id !== accountId) {
        await pushInvoice(payment.invoice.id, organizationId);
        const updatedPayment = await sdb.invoice_payment.findFirst({
            where: { id: paymentId, account_id: accountId },
            include: { 
                invoice: {
                    include: { 
                        client: {
                            include: { client_external_mapping: true }
                        }
                    }
                } 
            },
        });
        if (!updatedPayment) {
            throw httpError(400, ErrorCodes.VALIDATION_ERROR, "Invoice could not be synced to QuickBooks");
        }
        payment = updatedPayment;
    }

    // qbCustomerId is the already-resolved QB customer id from the mapping that
    // pushInvoice upserts — not a display name. Use it directly for CustomerRef.
    const mapping = payment.invoice.client.client_external_mapping.find(m => m.provider === "quickbooks");
    const qbCustomerId = mapping?.external_id;
    if (!qbCustomerId) {
        throw httpError(400, ErrorCodes.VALIDATION_ERROR, "Customer not found in QuickBooks");
    }

    const result = await qbFetch(organizationId, "POST", "/payment", {
        CustomerRef: {
            value: qbCustomerId
        },
        TotalAmt: Number(payment.amount),
        TxnDate: payment.paid_at.toISOString().split("T")[0],
        Line: [{
            Amount: Number(payment.amount),
            LinkedTxn: [{
                TxnId: payment.invoice.qb_invoice_id,
                TxnType: "Invoice"
            }]
        }]
    }) as QBPaymentResponse;

    if (!result) {
        throw httpError(400, ErrorCodes.VALIDATION_ERROR, "Payment could not be pushed to QuickBooks");
    }

    await sdb.invoice_payment.update({
        where: { id: paymentId },
        data: { qb_payment_id: result.Payment.Id, account_id: accountId }
    });

    await logExternalSync({
        provider: "quickbooks",
        external_id: result.Payment.Id,
        entity_type: "payment",
        action: "create",
        payload: result.Payment,
        organization_id: organizationId
    });
}

export async function deleteQBPayment(qbPaymentId: string, organizationId: string) {
    // Takes the QB payment id directly — the local invoice_payment row is already
    // deleted by the time this fire-and-forget runs (mirrors voidQBInvoice).
    try {
        const existing = (await qbFetch(organizationId, "GET", `/payment/${qbPaymentId}`)) as QBPaymentResponse;
        await qbFetch(organizationId, "POST", "/payment?operation=delete", {
            Id: qbPaymentId,
            SyncToken: existing.Payment.SyncToken,
        });

        await logExternalSync({
            provider: "quickbooks",
            external_id: qbPaymentId,
            entity_type: "payment",
            action: "delete",
            payload: { qbPaymentId },
            organization_id: organizationId,
        });
    } catch (error) {
        // If QB says the payment is already gone, treat as success (idempotent).
        if (/not\s*found|ObjectNotFound|object not found/i.test(String(error))) {
            return;
        }
        throw error; // real failure — let the caller log delete_failed
    }
}