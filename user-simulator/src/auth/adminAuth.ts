import http from "../services/httpService.js";
import { config } from "../config.js";

type Cached = { token: string; expiresAt: number };

let cached: Cached | null = null;
let inflight: Promise<string> | null = null;

async function login(): Promise<string> {
	const loginResp = await http.post(`${config.backendUrl}/login`, {
		email: config.adminEmail,
		password: config.adminPassword,
		role: config.adminRole,
	});
	const loginData = loginResp.data;
	if (!loginData?.success) {
		const msg = loginData?.error?.message ?? "Login failed";
		throw new Error(`adminAuth: ${msg}`);
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
			{ headers: { Authorization: `Bearer ${pendingToken}` } },
		);
		const otpData = otpResp.data;
		if (!otpData?.success || !otpData?.data?.token) {
			const msg = otpData?.error?.message ?? "OTP verify failed";
			throw new Error(`adminAuth: ${msg}`);
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
