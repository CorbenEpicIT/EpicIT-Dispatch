import OAuthClient from "intuit-oauth";
import { getScopedDb } from "../lib/context.js";
import { db } from "../db.js";

const QB_ENV = (process.env.QB_ENVIRONMENT ?? "sandbox") as "sandbox" | "production";
const QB_BASE =
	QB_ENV === "production"
		? "https://quickbooks.api.intuit.com"
		: "https://sandbox-quickbooks.api.intuit.com";

function makeOAuthClient() {
	return new OAuthClient({
		clientId: process.env.QB_CLIENT_ID!,
		clientSecret: process.env.QB_CLIENT_SECRET!,
		environment: QB_ENV,
		redirectUri: process.env.QB_REDIRECT_URI!,
	});
}

export function getAuthUrl(orgId: string): string {
	const client = makeOAuthClient();
	return client.authorizeUri({
		scope: [OAuthClient.scopes.Accounting],
		state: orgId,
	});
}

export async function handleCallback(
	fullCallbackUrl: string,
	orgId: string,
	realmId: string,
): Promise<void> {
	const client = makeOAuthClient();
	const authResponse = await client.createToken(fullCallbackUrl);
	const token = authResponse.getJson() as {
		access_token: string;
		refresh_token: string;
		expires_in: number;
	};
	const sdb = getScopedDb(orgId);
	await sdb.organization.update({
		where: { id: orgId },
		data: {
			qb_realm_id: realmId,
			qb_access_token: token.access_token,
			qb_refresh_token: token.refresh_token,
			qb_token_expires_at: new Date(Date.now() + token.expires_in * 1000),
		},
	});
}

async function getValidToken(orgId: string): Promise<{ accessToken: string; realmId: string }> {
	const sdb = getScopedDb(orgId);
	const org = await sdb.organization.findUnique({
		where: { id: orgId },
		select: {
			qb_access_token: true,
			qb_refresh_token: true,
			qb_token_expires_at: true,
			qb_realm_id: true,
		},
	});

	if (!org?.qb_access_token || !org.qb_realm_id) {
		throw new Error("QuickBooks not connected for this organization");
	}

	// Refresh if token expires within 5 minutes
	const expiresAt = org.qb_token_expires_at?.getTime() ?? 0;
	if (expiresAt < Date.now() + 5 * 60 * 1000) {
		try {
			const client = makeOAuthClient();
			client.setToken({ refresh_token: org.qb_refresh_token! });
			const refreshed = await client.refresh();
			const token = refreshed.getJson() as {
				access_token: string;
				refresh_token: string;
				expires_in: number;
			};

			await sdb.organization.update({
				where: { id: orgId },
				data: {
					qb_access_token: token.access_token,
					qb_refresh_token: token.refresh_token,
					qb_token_expires_at: new Date(Date.now() + token.expires_in * 1000),
				},
			});

			return { accessToken: token.access_token, realmId: org.qb_realm_id };
		} catch {
			// Refresh token is invalid — clear tokens so status returns disconnected
			await sdb.organization.update({
				where: { id: orgId },
				data: {
					qb_access_token: null,
					qb_refresh_token: null,
					qb_token_expires_at: null,
				},
			});
			throw new Error("QuickBooks authorization expired. Please reconnect.");
		}
	}

	return { accessToken: org.qb_access_token, realmId: org.qb_realm_id };
}

async function qbFetch(
	orgId: string,
	method: string,
	path: string,
	body?: unknown,
): Promise<unknown> {
	const { accessToken, realmId } = await getValidToken(orgId);
	const sep = path.includes("?") ? "&" : "?";
	const url = `${QB_BASE}/v3/company/${realmId}${path}${sep}minorversion=75`;

	const res = await fetch(url, {
		method,
		headers: {
			Authorization: `Bearer ${accessToken}`,
			Accept: "application/json",
			"Content-Type": "application/json",
		},
		body: body !== undefined ? JSON.stringify(body) : undefined,
	});

	if (!res.ok) {
		const text = await res.text();
		throw new Error(`QB ${method} ${path} → ${res.status}: ${text}`);
	}

	return res.json();
}

async function findOrCreateQBCustomer(orgId: string, displayName: string): Promise<string> {
	const { accessToken, realmId } = await getValidToken(orgId);
	const escaped = displayName.replace(/'/g, "\\'");
	const qs = encodeURIComponent(`SELECT * FROM Customer WHERE DisplayName = '${escaped}'`);
	const url = `${QB_BASE}/v3/company/${realmId}/query?query=${qs}&minorversion=75`;

	const res = await fetch(url, {
		headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
	});
	const data = (await res.json());
	const existing = data?.QueryResponse?.Customer;
	if (existing?.length) return existing[0].Id as string;

	const created = (await qbFetch(orgId, "POST", "/customer", {
		DisplayName: displayName,
	})) as any;
	return created.Customer.Id as string;
}

export async function findAllQBCustomers(orgId: string): Promise<any> {
	const { accessToken, realmId } = await getValidToken(orgId);
	const qs = encodeURIComponent(`SELECT * FROM Customer`);
	const url = `${QB_BASE}/v3/company/${realmId}/query?query=${qs}&minorversion=75`;

	const res = await fetch(url, {
		headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
	});
	const data = (await res.json());
	const customers = data?.QueryResponse?.Customer;

	return customers;
}

export async function isQBConnected(orgId: string): Promise<boolean> {
	const sdb = getScopedDb(orgId);
	const org = await sdb.organization.findUnique({
		where: { id: orgId },
		select: { qb_access_token: true },
	});
	return !!org?.qb_access_token;
}

export async function getQBStatus(
	orgId: string,
): Promise<{ connected: boolean; realmId: string | null }> {
	const sdb = getScopedDb(orgId);
	const org = await sdb.organization.findUnique({
		where: { id: orgId },
		select: { qb_realm_id: true, qb_access_token: true },
	});
	return {
		connected: !!(org?.qb_access_token && org.qb_realm_id),
		realmId: org?.qb_realm_id ?? null,
	};
}

export async function pushInvoice(invoiceId: string, orgId: string): Promise<void> {
	const sdb = getScopedDb(orgId);
	const invoice = await sdb.invoice.findFirst({
		where: { id: invoiceId },
		include: {
			line_items: true,
			client: {
				include: {
					contacts: {
						where: { is_primary: true },
						include: { contact: { select: { email: true } } },
						take: 1,
					},
					client_external_mapping: {
						where: { provider: "quickbooks" },
						take: 1,
					},
				},
			},
		},
	});
	if (!invoice) throw new Error("Invoice not found");

	const primaryEmail = invoice.client.contacts?.[0]?.contact?.email ?? null;
	const existingQBId = invoice.client.client_external_mapping?.[0]?.external_id ?? null;
	const customerId = existingQBId ?? (await findOrCreateQBCustomer(orgId, invoice.client.name));

	// Cache the QB customer ID so this client is excluded from the import dropdown
	if (!existingQBId) {
		await sdb.client_external_mapping.upsert({
			where: { provider_external_id: { provider: "quickbooks", external_id: customerId } },
			create: { client_id: invoice.client_id, provider: "quickbooks", external_id: customerId },
			update: {},
		}).catch(() => {});
	}

	const lines = invoice.line_items.map((item) => ({
		Amount: Number(item.total),
		DetailType: "SalesItemLineDetail",
		Description: item.description ?? item.name,
		SalesItemLineDetail: {
			Qty: Number(item.quantity),
			UnitPrice: Number(item.unit_price),
			ItemRef: { value: "1", name: "Services" },
		},
	}));

	if (invoice.qb_invoice_id) {
		const existing = (await qbFetch(
			orgId,
			"GET",
			`/invoice/${invoice.qb_invoice_id}`,
		)) as any;

		await qbFetch(orgId, "POST", "/invoice", {
			sparse: true,
			Id: invoice.qb_invoice_id,
			SyncToken: existing.Invoice.SyncToken,
			CustomerRef: { value: customerId },
			Line: lines,
			...(invoice.due_date && { DueDate: invoice.due_date.toISOString().split("T")[0] }),
			...(primaryEmail && { BillEmail: { Address: primaryEmail } }),
		});

		await sdb.invoice.update({
			where: { id: invoiceId },
			data: { qb_sync_status: "synced" },
		});
	} else {
		const created = (await qbFetch(orgId, "POST", "/invoice", {
			CustomerRef: { value: customerId },
			Line: lines,
			DocNumber: invoice.invoice_number,
			...(invoice.due_date && { DueDate: invoice.due_date.toISOString().split("T")[0] }),
			...(primaryEmail && { BillEmail: { Address: primaryEmail } }),
		})) as any;

		await sdb.invoice.update({
			where: { id: invoiceId },
			data: {
				qb_invoice_id: created.Invoice.Id,
				qb_sync_status: "synced",
			},
		});
	}
}

export async function disconnectOrg(orgId: string): Promise<void> {
	const sdb = getScopedDb(orgId);
	await sdb.organization.update({
		where: { id: orgId },
		data: {
			qb_realm_id: null,
			qb_access_token: null,
			qb_refresh_token: null,
			qb_token_expires_at: null,
		},
	});
}


export async function sendInvoiceEmail(invoiceId: string, orgId: string, sendTo: string): Promise<void>{
	const invoice = await db.invoice.findFirst({
		where: { id: invoiceId, organization_id: orgId },
		select: { qb_invoice_id: true },
	});
	if (!invoice) throw new Error("Invoice not found");
	if (!invoice.qb_invoice_id){
		await pushInvoice(invoiceId, orgId);
		const refresh = await db.invoice.findFirst({
			where: { id: invoiceId, organization_id: orgId },
			select: { qb_invoice_id: true },
		});
		if (!refresh?.qb_invoice_id) throw new Error("QB sync failed");
		invoice.qb_invoice_id = refresh.qb_invoice_id;
	}

	// Set BillEmail and EmailStatus: "NeedToSend" in one sparse update.
	// QB processes this as a send request and sets EmailStatus to "EmailSent".
	// (The /invoice/{id}/send endpoint has a known NullPointerException bug in sandbox.)
	const existing = (await qbFetch(orgId, "GET", `/invoice/${invoice.qb_invoice_id}`)) as any;
	await qbFetch(orgId, "POST", "/invoice", {
		sparse: true,
		Id: invoice.qb_invoice_id,
		SyncToken: existing.Invoice.SyncToken,
		BillEmail: { Address: sendTo },
		EmailStatus: "NeedToSend",
	});
}