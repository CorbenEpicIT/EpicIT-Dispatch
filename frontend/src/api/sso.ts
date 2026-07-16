import { api } from "./axiosClient";
import type { ApiResponse } from "../types/api";

export interface SsoExchangeResponse {
	token: string;
	expiresIn: number;
	user: { uid: string; email: string; role: string };
	forcePasswordReset?: boolean;
	resetToken?: string;
}

export type SsoProvider = "google" | "microsoft";

export function ssoStart(provider: SsoProvider): void {
	const backend = import.meta.env.VITE_BACKEND_URL;
	window.location.href = `${backend}/auth/sso/start?provider=${provider}`;
}

export const getSsoProviders = async (): Promise<SsoProvider[]> => {
	const response = await api.get<ApiResponse<{ providers: SsoProvider[] }>>(
		"/auth/sso/providers",
	);
	return response.data.data?.providers ?? [];
};

export const ssoExchange = async (code: string): Promise<SsoExchangeResponse> => {
	const response = await api.post<ApiResponse<SsoExchangeResponse>>(
		"/auth/sso/exchange",
		{ code },
	);
	if (!response.data.data) {
		throw new Error(response.data.error?.message ?? "SSO exchange failed");
	}
	const token = response.data.data.token;
	localStorage.setItem("accessToken", token);
	api.defaults.headers.common["Authorization"] = `Bearer ${token}`;
	return response.data.data;
};
