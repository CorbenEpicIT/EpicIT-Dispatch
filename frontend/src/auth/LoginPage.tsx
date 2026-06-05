import { useNavigate, Link } from "react-router-dom";
import { useAuthStore } from "./authStore";
import { useRef, useState } from "react";
import { loginCall, verifyOTPCall } from "../api/authenticate.ts"
import { reSplitAlphaNumeric } from "@tanstack/react-table";

export default function LoginPage() {
	const { login } = useAuthStore();

	const [name, setName] = useState("");
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
			// If the backend returned a full access token (first login OR OTP
			// disabled), skip the OTP step and route based on the payload.
			if (result.token) {
				const parts = result.token.split(".");
				if (parts.length === 3) {
					const payload = JSON.parse(atob(parts[1]));
					const orgTimezone = payload.organization_timezone ?? "America/Chicago";
					const permissions: string[] = payload.permissions ?? [];
					login(payload.role, name || "User", payload.uid, payload.organization_id ?? null, orgTimezone, permissions);
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
			//console.error("Login failed:", error);
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

	// seperate from login so that it doesn't need args
	const resendOTP = async () => {
		try {
			setIsLoading(true);
			const result = await loginCall({ email: name, password: password });
			console.log("resend OTP result:",result);
			setOtpSent(true);
		} catch (error) {
			console.error("Resend OTP failed:", error);
		}finally {
			setIsLoading(false);
		}
	}

	// ========================================================
	// helper functions for otp input
	// ========================================================
	const handleOtpChange = (index: number, value: string) => {
		// checks if its a number, if not returns
		if (!/^\d*$/.test(value)) return;

		const newOtp = [...otp];
		newOtp[index] = value;
		setOtp(newOtp);

		if (value && index < otp.length -1){
			inputRefs.current[index + 1]?.focus();
		}
	}

	const handleOtpPaste = (e: React.ClipboardEvent) =>{
		e.preventDefault();
		const pasteData = e.clipboardData.getData("Text").trim();

		if (!/^\d{6}$/.test(pasteData)) return;
		
		const newOtp = pasteData.split("");
		setOtp(newOtp);
		inputRefs.current[newOtp.length - 1]?.focus();
	}

	const handleOtpKeyDown = (e: React.KeyboardEvent, index: number) => {
		if (e.key === "Backspace" && !otp[index] && index > 0) {
			inputRefs.current[index - 1]?.focus();
		}
	};

	return (
		<div className="flex min-h-svh items-center justify-center bg-canvas">
			{isLoading ? (
				<div className="bg-surface shadow-md rounded-lg p-8 w-80 space-y-4">
					<div className="h-6 w-48 bg-surface-raised rounded animate-pulse mx-auto" />
					<div className="h-10 w-full bg-surface-raised rounded animate-pulse" />
					<div className="h-10 w-full bg-surface-raised rounded animate-pulse" />
				</div>
			) : otpSent ? (
				<form
					onSubmit={handleOTPVerification}
					className="bg-surface shadow-md rounded-lg p-8 w-80 space-y-4"
				>
					<h2 className="text-xl font-semibold text-center">OTP Verification</h2>
						<div className="w-full flex justify-center space-x-1">
							{otp.map((digit, index) =>(
								<input
									key={`otp-${index}`}
									type="text"
									maxLength={1}
									value={digit}
									onChange={(e)=>handleOtpChange(index, e.target.value)}
									onPaste={(e)=>handleOtpPaste(e)}
									onKeyDown={(e)=>handleOtpKeyDown(e, index)}
									className="w-10 h-10 border border-input bg-surface-inset rounded text-center text-lg text-primary"
									ref={(el) => {inputRefs.current[index] = el;}}
								>

								</input>
							))}
						</div>
					<button
						type="submit"
						className="w-full bg-primary-hover text-on-primary py-2 rounded hover:bg-primary-active"
					>
						Verify OTP
					</button>
					<p className="text-sm text-secondary text-center">
						Didn't receive the code?&ensp;
						<button className="text-link hover:underline" onClick={resendOTP}> Resend OTP</button>
					</p>
					<p className="text-sm text-secondary text-center">
						If using test user, enter "000000" as OTP.
					</p>
				</form>
			) : (
				<form
					onSubmit={handleLogin}
					className="bg-surface shadow-md rounded-lg p-8 w-80 space-y-4"
				>
				<h2 className="text-xl font-semibold text-center">Service Login</h2>
				{loginError && (
					<p className="text-error-text text-sm text-center">{loginError}</p>
				)

				}
				<input
					type="text"
					placeholder="Name"
					value={name}
					onChange={(e) => setName(e.target.value)}
					className="w-full border border-input bg-surface-inset rounded px-3 py-2 text-primary placeholder:text-faint focus:outline-none focus:ring-1 focus:ring-primary-border"
				/>
				<input 
					type="password"
					placeholder="Password"
					value={password}
					onChange={(e)=>setPassword(e.target.value)}
					className="w-full border border-input bg-surface-inset rounded px-3 py-2 text-primary placeholder:text-faint focus:outline-none focus:ring-1 focus:ring-primary-border"
				/>
				<button
					type="submit"
					className="w-full bg-primary-hover text-on-primary py-2 rounded hover:bg-primary-active"
				>
					Login
				</button>
				<p className="text-sm text-secondary text-center">
					New organization?{" "}
					<Link to="/register" className="text-link hover:underline">Create account</Link>
				</p>
			</form>
		)}
		</div>
	);
}
