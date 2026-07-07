import { useNavigate, Link } from "react-router-dom";
import { useAuthStore } from "./authStore";
import { useRef, useState } from "react";
import { loginCall, verifyOTPCall } from "../api/authenticate.ts"
import { useRememberedAccountsStore } from "../stores/rememberedAccountsStore";

export default function LoginPage() {
	const { login } = useAuthStore();
	const upsertAccount = useRememberedAccountsStore((s) => s.upsertAccount);
	const email = new URLSearchParams(window.location.search).get("email") || "";
	const [name, setName] = useState(email);
	const [password, setPassword] = useState("");
	const [otp, setOtp] = useState(["", "", "", "", "", ""]);
	const [otpSent, setOtpSent] = useState(false);
	const [isLoading, setIsLoading] = useState(false);
	const [loginError, setLoginError] = useState("");
	const inputRefs = useRef<(HTMLInputElement | null)[]>([]);
	const navigate = useNavigate();

	const handleLogin = async (e: React.FormEvent) => {
		e.preventDefault();
		try {
			setIsLoading(true);
			const result = await loginCall({ email: name, password: password });
			if (result.token) {
				const parts = result.token.split(".");
				if (parts.length === 3) {
					const payload = JSON.parse(atob(parts[1]));
					const orgTimezone = payload.organization_timezone ?? "America/Chicago";
					const permissions: string[] = payload.permissions ?? [];
					login(payload.role, name || "User", payload.uid, payload.organization_id ?? null, orgTimezone, permissions);
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
				}
				return;
			}
			setOtpSent(true);
		} catch (error) {
			setLoginError("Login failed");
		} finally {
			setIsLoading(false);
		}
	};

	const handleOTPVerification = async (e: React.FormEvent) => {
		e.preventDefault();
		try {
			const result = await verifyOTPCall(otp.join(""));
			const parts = result.token?.split(".");
			if (!parts || parts.length !== 3) throw new Error("Malformed token received from server");
			const payload = JSON.parse(atob(parts[1]));
			if (!payload.uid) throw new Error("Token is missing user ID — contact support");
			const orgTimezone = payload.organization_timezone ?? "America/Chicago";
			const permissions: string[] = payload.permissions ?? [];
			login(payload.role, name || "User", payload.uid, payload.organization_id ?? null, orgTimezone, permissions);
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
				return;
			}
			if (payload.role === "technician") navigate("/technician");
			else navigate("/dispatch");
		} catch (error) {
			console.error("OTP verification failed:", error);
		}
	};

	const resendOTP = async () => {
		try {
			setIsLoading(true);
			await loginCall({ email: name, password: password });
			setOtpSent(true);
		} catch (error) {
			console.error("Resend OTP failed:", error);
		} finally {
			setIsLoading(false);
		}
	};

	const handleOtpChange = (index: number, value: string) => {
		if (!/^\d*$/.test(value)) return;
		const newOtp = [...otp];
		newOtp[index] = value;
		setOtp(newOtp);
		if (value && index < otp.length - 1) {
			inputRefs.current[index + 1]?.focus();
		}
	};

	const handleOtpPaste = (e: React.ClipboardEvent) => {
		e.preventDefault();
		const pasteData = e.clipboardData.getData("Text").trim();
		if (!/^\d{6}$/.test(pasteData)) return;
		const newOtp = pasteData.split("");
		setOtp(newOtp);
		inputRefs.current[newOtp.length - 1]?.focus();
	};

	const handleOtpKeyDown = (e: React.KeyboardEvent, index: number) => {
		if (e.key === "Backspace" && !otp[index] && index > 0) {
			inputRefs.current[index - 1]?.focus();
		}
	};

	const cardClass = "bg-white shadow-md rounded-lg p-8 w-80 space-y-4 border border-zinc-200";
	const inputClass = "w-full border border-zinc-300 bg-zinc-50 rounded-md px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:ring-1 focus:ring-blue-400 transition-colors";

	return (
		<div className="flex min-h-svh items-center justify-center bg-gray-50">
			{isLoading ? (
				<div className={cardClass}>
					<div className="h-6 w-48 bg-zinc-100 rounded animate-pulse mx-auto" />
					<div className="h-10 w-full bg-zinc-100 rounded animate-pulse" />
					<div className="h-10 w-full bg-zinc-100 rounded animate-pulse" />
				</div>
			) : otpSent ? (
				<form onSubmit={handleOTPVerification} className={cardClass}>
					<h2 className="text-xl font-semibold text-center text-zinc-900">OTP Verification</h2>
					<div className="w-full flex justify-center space-x-1">
						{otp.map((digit, index) => (
							<input
								key={`otp-${index}`}
								type="text"
								maxLength={1}
								value={digit}
								onChange={(e) => handleOtpChange(index, e.target.value)}
								onPaste={(e) => handleOtpPaste(e)}
								onKeyDown={(e) => handleOtpKeyDown(e, index)}
								className="w-10 h-10 border border-zinc-300 bg-zinc-50 rounded-md text-center text-lg text-zinc-900 focus:outline-none focus:ring-1 focus:ring-blue-400 transition-colors"
								ref={(el) => { inputRefs.current[index] = el; }}
							/>
						))}
					</div>
					<button
						type="submit"
						className="w-full bg-primary text-on-primary py-2 rounded hover:bg-primary-hover transition-colors"
					>
						Verify OTP
					</button>
					<p className="text-sm text-zinc-500 text-center">
						Didn't receive the code?&ensp;
						<button type="button" className="text-blue-600 hover:underline" onClick={resendOTP}>
							Resend OTP
						</button>
					</p>
					<p className="text-sm text-zinc-500 text-center">
						If using test user, enter "000000" as OTP.
					</p>
				</form>
			) : (
				<form onSubmit={handleLogin} className={cardClass}>
					<h2 className="text-xl font-semibold text-center text-zinc-900">Service Login</h2>
					{loginError && (
						<p className="text-red-600 text-sm text-center">{loginError}</p>
					)}
					<input
						type="text"
						placeholder="Email"
						value={name}
						onChange={(e) => setName(e.target.value)}
						className={inputClass}
					/>
					<input
						type="password"
						placeholder="Password"
						value={password}
						onChange={(e) => setPassword(e.target.value)}
						className={inputClass}
					/>
					<button
						type="submit"
						className="w-full bg-primary text-on-primary py-2 rounded hover:bg-primary-hover transition-colors"
					>
						Login
					</button>
					<p className="text-sm text-zinc-500 text-center">
						New organization?{" "}
						<Link to="/register" className="text-blue-600 hover:underline">Create account</Link>
					</p>
				</form>
			)}
		</div>
	);
}
