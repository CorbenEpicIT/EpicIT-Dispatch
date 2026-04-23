import { renderToBuffer, type DocumentProps } from "@react-pdf/renderer";
import React from "react";
import type { JSXElementConstructor, ReactElement } from "react";
import { QuotePdfTemplate } from "./quotePdfTemplate.js";
import { InvoicePdfTemplate } from "./invoicePdfTemplate.js";
import { getQuoteById } from "../../controllers/quotesController.js";
import { getInvoiceById } from "../../controllers/invoicesController.js";
import { db } from "../../db.js";
import { getBuffer } from "../../services/wasabiService.js";

type DocElement = ReactElement<DocumentProps, string | JSXElementConstructor<unknown>>;

const fallbackOrg = { name: "—", logo_url: null, phone: null, address: null, email: null, website: null };

async function fetchOrg(organizationId: string | null | undefined) {
	if (!organizationId) return fallbackOrg;
	const org = await db.organization.findUnique({
		where: { id: organizationId },
		select: { name: true, logo_url: true, phone: true, address: true, email: true, website: true },
	});
	if (!org) return fallbackOrg;

	let logo_url: string | null = null;
	if (org.logo_url) {
		try {
			const { buffer, contentType } = await getBuffer(org.logo_url);
			logo_url = `data:${contentType};base64,${buffer.toString("base64")}`;
		} catch {
			logo_url = null;
		}
	}
	return { ...org, logo_url };
}

export async function generateQuotePdf(quoteId: string, organizationId: string): Promise<Buffer> {
	const quote = await getQuoteById(quoteId, organizationId);
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

	const org = await fetchOrg(quote.organization_id);

	const element = React.createElement(
		QuotePdfTemplate,
		{ quote: { ...quote, status: effectiveStatus }, org },
	) as unknown as DocElement;
	return renderToBuffer(element) as Promise<Buffer>;
}

export async function generateInvoicePdf(invoiceId: string, organizationId: string): Promise<Buffer> {
	const invoice = await getInvoiceById(invoiceId, organizationId);
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

	const org = await fetchOrg(invoice.organization_id);

	const element = React.createElement(
		InvoicePdfTemplate,
		{ invoice: { ...invoice, status: effectiveStatus }, org },
	) as unknown as DocElement;
	return renderToBuffer(element) as Promise<Buffer>;
}
