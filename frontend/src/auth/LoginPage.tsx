import { useNavigate } from "react-router-dom";
import { useAuthStore } from "./authStore";
import { useRef, useState } from "react";
import { loginCall, verifyOTPCall } from "../api/authenticate.ts"
import { reSplitAlphaNumeric } from "@tanstack/react-table";

export default function LoginPage() {
	const { login } = useAuthStore();
	const [role, setRole] = useState<"dispatcher" | "technician">("dispatcher");

	const DEV_CREDENTIALS = {
		dispatcher: { name: "admin@epichvac.com", password: "password123" },
		technician: { name: "john.smith@epichvac.com", password: "password123" },
	};

	const [name, setName] = useState(DEV_CREDENTIALS.dispatcher.name);
	const [password, setPassword] = useState(DEV_CREDENTIALS.dispatcher.password);
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
			const result = await loginCall({ email: name, password: password, role: role });
			// First login: OTP skipped, redirect straight to password reset
			if (result.forcePasswordReset && result.resetToken && result.token) {
				const parts = result.token.split(".");
				if (parts.length === 3) {
					const payload = JSON.parse(atob(parts[1]));
					const orgTimezone = payload.organization_timezone ?? "America/Chicago";
					login(role, name || "User", payload.uid, orgTimezone);
				}
				navigate(`/reset-password?token=${result.resetToken}&role=${role}`);
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
			login(payload.role, name || "User", payload.uid, orgTimezone);
			if (result.forcePasswordReset && result.resetToken) {
				navigate(`/reset-password?token=${result.resetToken}&role=${role}`);
				return;
			}
			if (role === "dispatcher") navigate("/dispatch");
			else navigate("/technician");
		} catch (error) {
			console.error("OTP verification failed:", error);
		}
	};

	// seperate from login so that it doesn't need args
	const resendOTP = async () => {
		try {
			setIsLoading(true);
			const result = await loginCall({ email: name, password: password, role: role });
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
		<div className="flex h-screen items-center justify-center bg-gray-100">
			{isLoading ? (
				<div className="bg-white shadow-md rounded-lg p-8 w-80 space-y-4">
					<div className="h-6 w-48 bg-gray-200 rounded animate-pulse mx-auto" />
					<div className="h-10 w-full bg-gray-200 rounded animate-pulse" />
					<div className="h-10 w-full bg-gray-200 rounded animate-pulse" />
				</div>
			) : otpSent ? (
				<form
					onSubmit={handleOTPVerification}
					className="bg-white shadow-md rounded-lg p-8 w-80 space-y-4"
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
									className="w-10 h-10 border rounded text-center text-lg"
									ref={(el) => {inputRefs.current[index] = el;}}
								>

								</input>
							))}
						</div>
					<button
						type="submit"
						className="w-full bg-blue-600 text-white py-2 rounded hover:bg-blue-700"
					>
						Verify OTP
					</button>
					<p className="text-sm text-gray-500 text-center">
						Didn't receive the code?&ensp;
						<button className="text-blue-600 hover:underline" onClick={resendOTP}> Resend OTP</button>
					</p>
					<p className="text-sm text-gray-500 text-center"> 
						If using test user, enter "000000" as OTP.
					</p>
				</form>
			) : (
				<form
					onSubmit={handleLogin}
					className="bg-white shadow-md rounded-lg p-8 w-80 space-y-4"
				>
				<h2 className="text-xl font-semibold text-center">Service Login</h2>
				{loginError && (
					<p className="text-red-500 text-sm text-center">{loginError}</p>
				)

				}
				<input
					type="text"
					placeholder="Name"
					value={name}
					onChange={(e) => setName(e.target.value)}
					className="w-full border rounded px-3 py-2"
				/>
				<input 
					type="password"
					placeholder="Password"
					value={password}
					onChange={(e)=>setPassword(e.target.value)}
					className="w-full border rounded px-3 py-2"
				/>
				<select
					value={role}
					onChange={(e) => {
						const newRole = e.target.value as "dispatcher" | "technician";
						setRole(newRole);
						setName(DEV_CREDENTIALS[newRole].name);
						setPassword(DEV_CREDENTIALS[newRole].password);
					}}
					className="w-full border rounded px-3 py-2"
				>
					<option value="dispatcher">Dispatch/Admin</option>
					<option value="technician">Technician</option>
				</select>
				<button
					type="submit"
					className="w-full bg-blue-600 text-white py-2 rounded hover:bg-blue-700"
				>
					Login
				</button>
			</form>
		)}
		</div>
	);
}
