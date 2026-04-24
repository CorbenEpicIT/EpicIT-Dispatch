import { renderToBuffer, type DocumentProps } from "@react-pdf/renderer";
import React from "react";
import type { JSXElementConstructor, ReactElement } from "react";
import { QuotePdfTemplate } from "./quotePdfTemplate.js";
import { InvoicePdfTemplate } from "./invoicePdfTemplate.js";
import { getQuoteById } from "../../controllers/quotesController.js";
import { getInvoiceById } from "../../controllers/invoicesController.js";
import { db } from "../../db.js";

type DocElement = ReactElement<DocumentProps, string | JSXElementConstructor<unknown>>;

export async function generateQuotePdf(quoteId: string): Promise<Buffer> {
	const quote = await getQuoteById(quoteId);
	if (!quote) throw Object.assign(new Error("Quote not found"), { status: 404 });

	// Auto-promote Draft → Issued on first PDF generation (document is now finalized)
	let effectiveStatus = quote.status;
	if (quote.status === "Draft") {
		await db.quote.update({
			where: { id: quoteId },
			data: { status: "Issued", issued_at: new Date() },
		});
		effectiveStatus = "Issued";
	}

	const element = React.createElement(
		QuotePdfTemplate,
		{ quote: { ...quote, status: effectiveStatus } },
	) as unknown as DocElement;
	return renderToBuffer(element) as Promise<Buffer>;
}

export async function generateInvoicePdf(invoiceId: string): Promise<Buffer> {
	const invoice = await getInvoiceById(invoiceId);
	if (!invoice) throw Object.assign(new Error("Invoice not found"), { status: 404 });

	// Auto-promote Draft → Issued on first PDF generation (document is now finalized)
	let effectiveStatus = invoice.status;
	if (invoice.status === "Draft") {
		await db.invoice.update({
			where: { id: invoiceId },
			data: { status: "Issued", issued_at: new Date() },
		});
		effectiveStatus = "Issued";
	}

	const element = React.createElement(
		InvoicePdfTemplate,
		{ invoice: { ...invoice, status: effectiveStatus } },
	) as unknown as DocElement;
	return renderToBuffer(element) as Promise<Buffer>;
}
