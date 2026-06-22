import OAuthClient from "intuit-oauth";
import { getScopedDb } from "../lib/context.js";
import { db } from "../db.js";
import { httpError, ErrorCodes } from "../types/responses.js";

const QB_ENV = (process.env.QB_ENVIRONMENT ?? "sandbox") as "sandbox" | "production";
export const QB_BASE =
	QB_ENV === "production"
		? "https://quickbooks.api.intuit.com"
		: "https://sandbox-quickbooks.api.intuit.com";

const inFlightRefreshes = new Map<string, Promise<{ accessToken: string; realmId: string }>>();

function makeOAuthClient() {
	return new OAuthClient({
		clientId: process.env.QB_CLIENT_ID!,
		clientSecret: process.env.QB_CLIENT_SECRET!,
		environment: QB_ENV,
		redirectUri: process.env.QB_REDIRECT_URI!,
	});
}

function isAuthGrantExpired(err: unknown): boolean {
	try{
		const error = err as any;
		const hay = [
			error?.error,
			error?.originalMessage,
			error?.message,
			JSON.stringify(error.authResponse?.body ?? error.authResponse)
		].filter(Boolean)
		.join(" ")
		.toLowerCase();
		return hay.includes("invalid_grant");
	}catch(err){
		return false;
	}
}

async function doRefresh(orgId: string): Promise<{ accessToken: string; realmId: string }> {
	const sdb = getScopedDb(orgId);

	const org = await sdb.organization.findUnique({
		where: { id: orgId },
		select: {
			qb_access_token: true,
			qb_refresh_token: true,
			qb_realm_id: true,
			qb_token_expires_at: true,
		}
	});

	if (!org?.qb_refresh_token || !org.qb_realm_id) {
		throw httpError(400, ErrorCodes.VALIDATION_ERROR, "QuickBooks not connected for this organization");
	}

	const expiresAt = org.qb_token_expires_at?.getTime() ?? 0;
	if (org.qb_access_token && expiresAt >= Date.now() + 5 * 60 * 1000) {
		return { accessToken: org.qb_access_token, realmId: org.qb_realm_id };
	}

	try{
		const client = makeOAuthClient();
		// Use refreshUsingToken (not setToken + refresh): refresh() runs a local
		// validateToken() that rejects our token because we never persist
		// x_refresh_token_expires_in, so it throws before ever calling Intuit.
		// refreshUsingToken POSTs the refresh token straight to Intuit.
		const refreshed = await client.refreshUsingToken(org.qb_refresh_token);
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
			}
		});
		return { accessToken: token.access_token, realmId: org.qb_realm_id };

	}catch (err) {
		if (isAuthGrantExpired(err)) {
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
		throw httpError(503, ErrorCodes.VALIDATION_ERROR, "QuickBooks temporarily unavailable, please retry.");
	}
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

	// Fast path: access token still valid for >5 minutes.
	const expiresAt = org.qb_token_expires_at?.getTime() ?? 0;
	if (expiresAt >= Date.now() + 5 * 60 * 1000) {
		return { accessToken: org.qb_access_token, realmId: org.qb_realm_id };
	}

	// Needs refresh — serialize per org so concurrent callers share ONE refresh
	// (Intuit rotates/invalidates the refresh token on first use; parallel
	// refreshes would otherwise make the losers fail and clear the connection).
	const existing = inFlightRefreshes.get(orgId);
	if (existing) return existing;

	const run = doRefresh(orgId).finally(() => {
		if (inFlightRefreshes.get(orgId) === run) {
			inFlightRefreshes.delete(orgId);
		}
	});
	inFlightRefreshes.set(orgId, run);
	return run;
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


