import { Link } from "react-router-dom";
import { useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { loginCall, verifyOTPCall, verifyMfaCall } from "../api/authenticate.ts";
import { setupMfa, enableMfa, type MfaSetupResponse, type MfaSession } from "../api/mfa";
import { SixDigitInput } from "../components/ui/forms/SixDigitInput.tsx";
import { Copy, Check } from "lucide-react";
import { ssoStart } from "../api/sso.ts";
import { useSsoProvidersQuery } from "../hooks/useSSO.ts";
import { useFinishLogin } from "./useFinishLogin.ts";

type Challenge = "none" | "otp" | "totp" | "enroll";

const EMPTY = ["", "", "", "", "", ""];

export default function LoginPage() {
	const email = new URLSearchParams(window.location.search).get("email") || "";
	const sso = new URLSearchParams(window.location.search).get("sso") || "";
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

	const finishLogin = useFinishLogin();
	const { data: ssoProviders = [] } = useSsoProvidersQuery();

	const handleLogin = async (e: React.FormEvent) => {
		e.preventDefault();
		setLoginError("");
		try {
			setIsLoading(true);
			const result = await loginCall({ email: name, password });
			if (result.token) {
				finishLogin(result, name);
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
			finishLogin(await verifyOTPCall(otp.join("")), name);
		} catch (error) {
			setLoginError("Verification failed");
		}
	};

	const handleTotpVerification = async (e: React.FormEvent) => {
		e.preventDefault();
		setLoginError("");
		try {
			const args = useBackup ? { backupCode } : { code: otp.join("") };
			finishLogin(await verifyMfaCall(args), name);
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
		if (enrollSession) finishLogin(enrollSession, name);
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
	const primaryBtn = "w-full bg-primary text-on-primary py-2 rounded hover:bg-primary-hover transition-colors hover:cursor-pointer";

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
					{ssoProviders.length > 0 && (
						<div className="flex items-center gap-3 py-1">
							<span className="h-px flex-1 bg-zinc-200" />
							<span className="text-xs text-zinc-400">or continue with</span>
							<span className="h-px flex-1 bg-zinc-200" />
						</div>
					)}
					{ssoProviders.includes("google") && (
						<button
							type="button"
							className="flex w-full items-center justify-center gap-3 rounded-md border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-900 transition-colors hover:bg-zinc-50 active:bg-zinc-100 focus:outline-none focus:ring-1 focus:ring-blue-400 hover:cursor-pointer"
							onClick={() => ssoStart("google")}
						>
							<svg
								className="h-5 w-5"
								viewBox="0 0 24 24"
								xmlns="http://www.w3.org/2000/svg"
								aria-hidden="true"
							>
								<path fill="#4285F4" d="M23.52 12.27c0-.79-.07-1.54-.2-2.27H12v4.51h6.47a5.53 5.53 0 0 1-2.4 3.63v3h3.88c2.27-2.09 3.57-5.17 3.57-8.87z" />
								<path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.76-2.11-6.7-4.94H1.28v3.09A11.997 11.997 0 0 0 12 24z" />
								<path fill="#FBBC05" d="M5.3 14.31A7.2 7.2 0 0 1 4.92 12c0-.8.14-1.58.38-2.31V6.6H1.28A11.997 11.997 0 0 0 0 12c0 1.94.46 3.77 1.28 5.4l4.02-3.09z" />
								<path fill="#EA4335" d="M12 4.75c1.76 0 3.34.61 4.59 1.8l3.44-3.44C17.95 1.14 15.24 0 12 0 7.31 0 3.26 2.69 1.28 6.6l4.02 3.09C6.24 6.86 8.88 4.75 12 4.75z" />
							</svg>

							<span>Sign in with Google</span>
						</button>
					)}
					{ssoProviders.includes("microsoft") && (
						<button
							type="button"
							className="flex w-full items-center justify-center gap-3 rounded-md border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-900 transition-colors hover:bg-zinc-50 active:bg-zinc-100 focus:outline-none focus:ring-1 focus:ring-blue-400 hover:cursor-pointer"
							onClick={() => ssoStart("microsoft")}
						>
							<svg
								className="h-5 w-5"
								viewBox="0 0 23 23"
								xmlns="http://www.w3.org/2000/svg"
								aria-hidden="true"
							>
								<rect width="10" height="10" fill="#F25022" />
								<rect x="13" width="10" height="10" fill="#7FBA00" />
								<rect y="13" width="10" height="10" fill="#00A4EF" />
								<rect x="13" y="13" width="10" height="10" fill="#FFB900" />
							</svg>

							<span>Sign in with Microsoft</span>
						</button>
					)}
					<p className="text-sm text-zinc-500 text-center">
						New organization?{" "}
						<Link to="/register" className="text-blue-600 hover:underline">Create account</Link>
					</p>
				</form>
			)}
		</div>
	);
}
