import { useNavigate, Link } from "react-router-dom";
import { useAuthStore } from "./authStore";
import { useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { loginCall, verifyOTPCall, verifyMfaCall } from "../api/authenticate.ts";
import { setupMfa, enableMfa, type MfaSetupResponse, type MfaSession } from "../api/mfa";
import { useRememberedAccountsStore } from "../stores/rememberedAccountsStore";
import { SixDigitInput } from "../components/ui/forms/SixDigitInput.tsx";
import { Copy, Check } from "lucide-react";

type Challenge = "none" | "otp" | "totp" | "enroll";

const EMPTY = ["", "", "", "", "", ""];

export default function LoginPage() {
	const { login } = useAuthStore();
	const upsertAccount = useRememberedAccountsStore((s) => s.upsertAccount);
	const email = new URLSearchParams(window.location.search).get("email") || "";
	const [name, setName] = useState(email);
	const [password, setPassword] = useState("");
	const [otp, setOtp] = useState<string[]>(EMPTY);
	const [challenge, setChallenge] = useState<Challenge>("none");
	const [isLoading, setIsLoading] = useState(false);
	const [loginError, setLoginError] = useState("");

	const [useBackup, setUseBackup] = useState(false);
	const [backupCode, setBackupCode] = useState("");

	const [copiedSecret, setCopiedSecret] = useState(false);
	const [enrollData, setEnrollData] = useState<MfaSetupResponse | null>(null);
	const [enrollBackupCodes, setEnrollBackupCodes] = useState<string[] | null>(null);
	const [enrollSession, setEnrollSession] = useState<MfaSession | null>(null);

	const navigate = useNavigate();

	const finishLogin = (result: { token: string; forcePasswordReset?: boolean; resetToken?: string }) => {
		const parts = result.token.split(".");
		if (parts.length !== 3) throw new Error("Malformed token received from server");
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
		} else if (payload.role === "technician") {
			navigate("/technician");
		} else {
			navigate("/dispatch");
		}
	};

	const handleLogin = async (e: React.FormEvent) => {
		e.preventDefault();
		setLoginError("");
		try {
			setIsLoading(true);
			const result = await loginCall({ email: name, password });
			if (result.token) {
				finishLogin(result);
				return;
			}
			const next: Challenge = result.challenge ?? "otp";
			setChallenge(next);
			if (next === "enroll") {
				setEnrollData(await setupMfa());
			}
		} catch (error) {
			setLoginError("Login failed");
		} finally {
			setIsLoading(false);
		}
	};

	const handleOTPVerification = async (e: React.FormEvent) => {
		e.preventDefault();
		setLoginError("");
		try {
			finishLogin(await verifyOTPCall(otp.join("")));
		} catch (error) {
			setLoginError("Verification failed");
		}
	};

	const handleTotpVerification = async (e: React.FormEvent) => {
		e.preventDefault();
		setLoginError("");
		try {
			const args = useBackup ? { backupCode } : { code: otp.join("") };
			finishLogin(await verifyMfaCall(args));
		} catch (error) {
			setLoginError("Invalid code");
		}
	};

	const handleEnrollVerify = async (e: React.FormEvent) => {
		e.preventDefault();
		setLoginError("");
		try {
			const result = await enableMfa(otp.join(""));
			if (result.session) {
				setEnrollSession(result.session);
				setEnrollBackupCodes(result.backupCodes);
			} else {
				setLoginError("Enrollment did not return a session");
			}
		} catch (error) {
			setLoginError("Invalid code");
		}
	};

	const handleEnrollContinue = () => {
		if (enrollSession) finishLogin(enrollSession);
	};

	const resendOTP = async () => {
		try {
			setIsLoading(true);
			await loginCall({ email: name, password });
		} catch (error) {
			console.error("Resend OTP failed:", error);
		} finally {
			setIsLoading(false);
		}
	};

	const cardClass = "bg-white shadow-md rounded-lg p-8 w-80 space-y-4 border border-zinc-200";
	const inputClass =
		"w-full border border-zinc-300 bg-zinc-50 rounded-md px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:ring-1 focus:ring-blue-400 transition-colors";
	const primaryBtn = "w-full bg-primary text-on-primary py-2 rounded hover:bg-primary-hover transition-colors";

	return (
		<div className="flex min-h-svh items-center justify-center bg-gray-50">
			{isLoading ? (
				<div className={cardClass}>
					<div className="h-6 w-48 bg-zinc-100 rounded animate-pulse mx-auto" />
					<div className="h-10 w-full bg-zinc-100 rounded animate-pulse" />
					<div className="h-10 w-full bg-zinc-100 rounded animate-pulse" />
				</div>
			) : challenge === "otp" ? (
				<form onSubmit={handleOTPVerification} className={cardClass}>
					<h2 className="text-xl font-semibold text-center text-zinc-900">OTP Verification</h2>
					{loginError && <p className="text-red-600 text-sm text-center">{loginError}</p>}
					<SixDigitInput value={otp} onChange={setOtp} autoFocus />
					<button type="submit" className={primaryBtn}>Verify OTP</button>
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
			) : challenge === "totp" ? (
				<form onSubmit={handleTotpVerification} className={cardClass}>
					<h2 className="text-xl font-semibold text-center text-zinc-900">Two-Factor Verification</h2>
					{loginError && <p className="text-red-600 text-sm text-center">{loginError}</p>}
					{useBackup ? (
						<>
							<p className="text-sm text-zinc-500 text-center">Enter one of your backup codes.</p>
							<input
								type="text"
								placeholder="Backup code"
								value={backupCode}
								onChange={(e) => setBackupCode(e.target.value)}
								className={inputClass}
								autoFocus
							/>
						</>
					) : (
						<>
							<p className="text-sm text-zinc-500 text-center">
								Enter the code from your authenticator app.
							</p>
							<SixDigitInput value={otp} onChange={setOtp} autoFocus />
						</>
					)}
					<button type="submit" className={primaryBtn}>Verify</button>
					<p className="text-sm text-zinc-500 text-center">
						<button
							type="button"
							className="text-blue-600 hover:underline"
							onClick={() => {
								setUseBackup((v) => !v);
								setLoginError("");
							}}
						>
							{useBackup ? "Use authenticator code" : "Use a backup code"}
						</button>
					</p>
				</form>
			) : challenge === "enroll" ? (
				enrollBackupCodes ? (
					<div className={cardClass}>
						<h2 className="text-xl font-semibold text-center text-zinc-900">Save Your Backup Codes</h2>
						<p className="text-sm text-zinc-500 text-center">
							Store these somewhere safe. Each can be used once if you lose your device.
						</p>
						<div className="grid grid-cols-2 gap-1 rounded-md bg-zinc-50 border border-zinc-200 p-3 font-mono text-sm text-zinc-900">
							{enrollBackupCodes.map((c) => (
								<span key={c} className="text-center">{c}</span>
							))}
						</div>
						<button type="button" className={primaryBtn} onClick={handleEnrollContinue}>
							Continue
						</button>
					</div>
				) : (
					<form onSubmit={handleEnrollVerify} className={cardClass}>
						<h2 className="text-xl font-semibold text-center text-zinc-900">Set Up Two-Factor Auth</h2>
						<p className="text-sm text-zinc-500 text-center">
							Your organization requires MFA. Scan this with Microsoft Authenticator,
							Okta Verify, Google Authenticator, or any authenticator app.
						</p>
						{enrollData ? (
							<>
								<div className="flex justify-center">
									<QRCodeSVG value={enrollData.otpAuthUri} size={168} />
								</div>
								<div className="space-y-1.5">
									<p className="text-xs text-zinc-500 text-center">Or enter this key manually:</p>
									<div className="group relative rounded-md border border-zinc-200 bg-zinc-50">
										<button
											type="button"
											onClick={() => {
												navigator.clipboard.writeText(enrollData.secret);
												setCopiedSecret(true);
												setTimeout(() => setCopiedSecret(false), 2000);
											}}
											className="absolute right-1.5 top-1.5 inline-flex items-center gap-1 rounded-md bg-zinc-100/90 px-2 py-1 text-xs text-zinc-600 opacity-100 backdrop-blur-sm transition-opacity hover:bg-zinc-200 focus-visible:opacity-100 sm:opacity-0 sm:group-hover:opacity-100"
										>
											{copiedSecret ? <Check size={14} className="text-green-600" /> : <Copy size={14} />}
											{copiedSecret ? "Copied" : "Copy"}
										</button>
										<code className="block break-all px-3 py-2 text-center font-mono text-sm leading-relaxed tracking-wider text-zinc-800">
											{enrollData.secret.replace(/(.{4})/g, "$1 ").trim()}
										</code>
									</div>
								</div>
								{loginError && <p className="text-red-600 text-sm text-center">{loginError}</p>}
								<SixDigitInput value={otp} onChange={setOtp} />
								<button type="submit" className={primaryBtn}>Verify &amp; Enable</button>
							</>
						) : (
							<p className="text-sm text-zinc-500 text-center">Preparing enrollment…</p>
						)}
					</form>
				)
			) : (
				<form onSubmit={handleLogin} className={cardClass}>
					<h2 className="text-xl font-semibold text-center text-zinc-900">Service Login</h2>
					{loginError && <p className="text-red-600 text-sm text-center">{loginError}</p>}
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
					<button type="submit" className={primaryBtn}>Login</button>
					<p className="text-sm text-zinc-500 text-center">
						New organization?{" "}
						<Link to="/register" className="text-blue-600 hover:underline">Create account</Link>
					</p>
				</form>
			)}
		</div>
	);
}
