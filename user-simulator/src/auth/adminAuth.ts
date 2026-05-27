import http from "../services/httpService.js";
import { config } from "../config.js";

type Cached = { token: string; expiresAt: number };

let cached: Cached | null = null;
let inflight: Promise<string> | null = null;

async function login(): Promise<string> {
	const loginResp = await http.post(
		`${config.backendUrl}/login`,
		{
			email: config.adminEmail,
			password: config.adminPassword,
			role: config.adminRole,
		},
		{ validateStatus: () => true },
	);
	const loginData = loginResp.data;
	if (loginResp.status >= 400 || !loginData?.success) {
		const code = loginData?.error?.code;
		const msg = loginData?.error?.message ?? `HTTP ${loginResp.status}`;
		console.error(
			`[adminAuth] /login failed (status=${loginResp.status}, email=${config.adminEmail}, role=${config.adminRole}, passwordSet=${config.adminPassword ? "yes" : "no"}):`,
			JSON.stringify(loginData),
		);
		throw new Error(
			`adminAuth login: HTTP ${loginResp.status}${code ? ` ${code}` : ""} — ${msg}`,
		);
	}

	let token: string | undefined = loginData.data?.token;
	let expiresInSec = Number(loginData.data?.expiresIn ?? 3600);

	if (!token) {
		const pendingToken: string | undefined = loginData.data?.pendingToken;
		if (!pendingToken) {
			throw new Error("adminAuth: login response missing token and pendingToken");
		}
		const otpResp = await http.post(
			`${config.backendUrl}/otp-verify`,
			{ otp: config.adminOtp },
			{
				headers: { Authorization: `Bearer ${pendingToken}` },
				validateStatus: () => true,
			},
		);
		const otpData = otpResp.data;
		if (otpResp.status >= 400 || !otpData?.success || !otpData?.data?.token) {
			const code = otpData?.error?.code;
			const msg = otpData?.error?.message ?? `HTTP ${otpResp.status}`;
			console.error(
				`[adminAuth] /otp-verify failed (status=${otpResp.status}):`,
				JSON.stringify(otpData),
			);
			throw new Error(
				`adminAuth otp-verify: HTTP ${otpResp.status}${code ? ` ${code}` : ""} — ${msg}`,
			);
		}
		token = otpData.data.token;
		expiresInSec = Number(otpData.data.expiresIn ?? 3600);
	}

	const expiresAt = Date.now() + Math.max(expiresInSec - 60, 30) * 1000;
	cached = { token: token!, expiresAt };
	return token!;
}

export async function getToken(): Promise<string> {
	if (cached && cached.expiresAt > Date.now()) return cached.token;
	if (inflight) return inflight;
	inflight = login().finally(() => {
		inflight = null;
	});
	return inflight;
}

export function invalidate() {
	cached = null;
}
