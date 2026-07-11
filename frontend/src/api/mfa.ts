import { isAxiosError } from "axios";
import { api } from "./axiosClient";
import type { ApiResponse } from "../types/api";

// Backend returns errors as { error: { message } } with a non-2xx status, so
// axios rejects before we can read the body. Re-throw with the real message.
function toError(err: unknown, fallback: string): Error {
	if (isAxiosError(err)) {
		return new Error(err.response?.data?.error?.message || err.message || fallback);
	}
	return err instanceof Error ? err : new Error(fallback);
}

export interface MfaSetupResponse {
	otpAuthUri: string;
	secret: string;
}

export interface MfaStatus {
	enabled: boolean;
	enrolledAt: string | null;
}

export interface MfaSession {
	token: string;
	expiresIn: number;
	user?: { uid: string; email: string; role: string };
	forcePasswordReset?: boolean;
	resetToken?: string;
}

export interface MfaEnableResponse {
	backupCodes: string[];
	session?: MfaSession | null;
}

export const setupMfa = async (): Promise<MfaSetupResponse> => {
	try {
		const response = await api.post<ApiResponse<MfaSetupResponse>>("/mfa/setup");
		return response.data.data!;
	} catch (err) {
		throw toError(err, "Failed to start MFA setup");
	}
};

export const enableMfa = async (code: string): Promise<MfaEnableResponse> => {
	try {
		const response = await api.post<ApiResponse<MfaEnableResponse>>("/mfa/enable", { code });
		return response.data.data!;
	} catch (err) {
		throw toError(err, "Failed to enable MFA");
	}
};

export const disableMfa = async (args: { password?: string; code?: string }): Promise<void> => {
	try {
		await api.post<ApiResponse<null>>("/mfa/disable", args);
	} catch (err) {
		throw toError(err, "Failed to disable MFA");
	}
};

export const getMfaStatus = async (): Promise<MfaStatus> => {
	try {
		const response = await api.get<ApiResponse<MfaStatus>>("/mfa/status");
		return response.data.data!;
	} catch (err) {
		throw toError(err, "Failed to load MFA status");
	}
};

export const resetMfa = async (userId: string, role: string): Promise<void> => {
	const endpoint =
		role === "technician"
			? `/technicians/${userId}/mfa/reset`
			: `/dispatchers/${userId}/mfa/reset`;
	try {
		await api.post<ApiResponse<null>>(endpoint);
	} catch (err) {
		throw toError(err, "Failed to reset MFA");
	}
};
