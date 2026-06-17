import OAuthClient from "intuit-oauth";
import { getScopedDb } from "../lib/context.js";
import { db } from "../db.js";
import { httpError, ErrorCodes } from "../types/responses.js";

const QB_ENV = (process.env.QB_ENVIRONMENT ?? "sandbox") as "sandbox" | "production";
export const QB_BASE =
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

export async function getValidToken(orgId: string): Promise<{ accessToken: string; realmId: string }> {
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
		throw httpError(400, ErrorCodes.VALIDATION_ERROR, "QuickBooks not connected for this organization");
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

export async function qbFetch(
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


