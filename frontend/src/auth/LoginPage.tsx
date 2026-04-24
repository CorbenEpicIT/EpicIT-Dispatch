import { useNavigate } from "react-router-dom";
import { useAuthStore } from "./authStore";
import { use, useRef, useState } from "react";
import { loginCall, verifyOTPCall } from "../api/authenticate.ts"

export default function LoginPage() {
	const { login } = useAuthStore();
	const [role, setRole] = useState<"dispatch" | "technician">("dispatch");
	const [name, setName] = useState("user");
	const [password, setPassword] = useState("");
	const [otp, setOtp] = useState(["", "", "", "", "", ""]);
	const [otpSent, setOtpSent] = useState(false);
	const [isLoading, setIsLoading] = useState(false);
	const inputRefs = useRef<(HTMLInputElement | null)[]>([]);
	const navigate = useNavigate();

	const handleLogin = async (e: React.FormEvent) => {
		e.preventDefault();
		try {
			setIsLoading(true);
			const result = await loginCall({ email: name, password: password, role: role });
			console.log("login result:",result);
			setOtpSent(true);
		} catch (error) {
			console.error("Login failed:", error);
		}finally {
			setIsLoading(false);
		}
	};

	const handleOTPVerification = async (e: React.FormEvent) => {
		e.preventDefault();
		try {
			const result = await verifyOTPCall(otp.join(""));
			console.log("otp verification result:", result);
			login(role, name || "User");
			if (role === "dispatch") navigate("/dispatch");
			else navigate("/technician");
		}catch (error) {
			console.error("OTP verification failed:", error);
		}
	}

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
					onChange={(e) => setRole(e.target.value as any)}
					className="w-full border rounded px-3 py-2"
				>
					<option value="dispatch">Dispatch/Admin</option>
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
