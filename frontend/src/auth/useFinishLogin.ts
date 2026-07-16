import { useNavigate } from "react-router-dom";
import { useAuthStore } from "./authStore";
import { useRememberedAccountsStore } from "../stores/rememberedAccountsStore";

type FinishLoginResult = {
	token: string;
	forcePasswordReset?: boolean;
	resetToken?: string;
};

// used by both password login and SSO completion
export function useFinishLogin() {
	const { login } = useAuthStore();
	const upsertAccount = useRememberedAccountsStore((s) => s.upsertAccount);
	const navigate = useNavigate();

	return (result: FinishLoginResult, displayName?: string) => {
		const parts = result.token.split(".");
		if (parts.length !== 3) throw new Error("Malformed token received from server");
		const payload = JSON.parse(atob(parts[1]));
		if (!payload.uid) throw new Error("Token is missing user ID — contact support");
		const orgTimezone = payload.organization_timezone ?? "America/Chicago";
		const permissions: string[] = payload.permissions ?? [];
		const name = displayName || payload.email?.split("@")[0] || "User";
		login(
			payload.role,
			name,
			payload.uid,
			payload.organization_id ?? null,
			orgTimezone,
			permissions,
		);
		if (payload.uid && payload.email) {
			upsertAccount({
				userId: payload.uid,
				email: payload.email,
				name: payload.email.split("@")[0],
				role: payload.role,
				orgId: payload.organization_id ?? null,
			});
		}
		if (result.forcePasswordReset && result.resetToken) {
			navigate(`/reset-password?token=${result.resetToken}&role=${payload.role}`);
		} else if (payload.role === "technician") {
			navigate("/technician");
		} else {
			navigate("/dispatch");
		}
	};
}
