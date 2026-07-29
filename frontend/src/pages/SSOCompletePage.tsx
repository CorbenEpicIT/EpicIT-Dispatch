import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { ssoExchange } from "../api/sso";
import { useFinishLogin } from "../auth/useFinishLogin";

export default function SSOCompletePage() {
	const finishLogin = useFinishLogin();
	const navigate = useNavigate();

	const ran = useRef(false);

	useEffect(() => {
		if (ran.current) return;
		ran.current = true;

		const code = new URLSearchParams(window.location.search).get("code");
		if (!code) {
			navigate("/login?sso=error", { replace: true });
			return;
		}

		ssoExchange(code)
			.then((result) => finishLogin(result))
			.catch(() => navigate("/login?sso=error", { replace: true }));
	}, [finishLogin, navigate]);

	return (
		<div className="flex min-h-svh items-center justify-center bg-gray-50">
			<div className="flex w-80 flex-col items-center gap-4 rounded-lg border border-zinc-200 bg-white p-8 text-center shadow-md">
				<div className="h-12 w-12 animate-spin rounded-full border-4 border-zinc-200 border-t-blue-600" />
				<h2 className="text-lg font-semibold text-zinc-900">Signing you in…</h2>
				<p className="text-sm text-zinc-500">Completing sign-in. This only takes a moment.</p>
			</div>
		</div>
	);
}
