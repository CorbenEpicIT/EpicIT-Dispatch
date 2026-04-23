import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { registerOrganization } from "../api/organizations";

type Status = "input" | "loading" | "success" | "error";

export default function RegisterPage() {
	const navigate = useNavigate();
	const [status, setStatus] = useState<Status>("input");
	const [errorMessage, setErrorMessage] = useState("");

	const [orgName, setOrgName] = useState("");
	const [adminName, setAdminName] = useState("");
	const [adminEmail, setAdminEmail] = useState("");
	const [adminPhone, setAdminPhone] = useState("");
	const [password, setPassword] = useState("");
	const [confirmPassword, setConfirmPassword] = useState("");

	const validate = (): string | null => {
		if (!orgName.trim()) return "Organization name is required.";
		if (!adminName.trim()) return "Your name is required.";
		if (password !== confirmPassword) return "Passwords do not match.";
		if (password.length < 8) return "Password must be at least 8 characters.";
		if (!/[A-Z]/.test(password)) return "Password must contain at least one capital letter.";
		if (!/[0-9]/.test(password)) return "Password must contain at least one number.";
		if (!/[^A-Za-z0-9]/.test(password)) return "Password must contain at least one special character.";
		return null;
	};

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		const err = validate();
		if (err) { setErrorMessage(err); return; }

		setStatus("loading");
		try {
			await registerOrganization({
				org_name: orgName.trim(),
				admin_name: adminName.trim(),
				admin_email: adminEmail.trim(),
				admin_password: password,
				admin_phone: adminPhone.trim() || undefined,
			});
			setStatus("success");
		} catch (e: any) {
			setErrorMessage(e.message || "Registration failed.");
			setStatus("error");
		}
	};

	const field = (
		label: string,
		type: string,
		value: string,
		onChange: (v: string) => void,
		placeholder?: string,
		required = true,
	) => (
		<div>
			<label className="block text-xs font-medium text-gray-600 uppercase tracking-wider mb-1">
				{label}{!required && <span className="ml-1 text-gray-400 normal-case">(optional)</span>}
			</label>
			<input
				type={type}
				value={value}
				onChange={(e) => { onChange(e.target.value); setErrorMessage(""); }}
				placeholder={placeholder}
				required={required}
				className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
			/>
		</div>
	);

	return (
		<div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
			<div className="bg-white rounded-2xl shadow-md p-10 max-w-md w-full">

				{status === "input" && (
					<form onSubmit={handleSubmit} className="space-y-4">
						<div className="text-center mb-2">
							<h1 className="text-2xl font-semibold text-gray-800">Create your account</h1>
							<p className="text-gray-500 text-sm mt-1">Set up your organization and admin account.</p>
						</div>

						<p className="text-xs font-semibold text-gray-400 uppercase tracking-wider pt-2">Organization</p>
						{field("Organization Name", "text", orgName, setOrgName, "e.g. Acme HVAC")}

						<p className="text-xs font-semibold text-gray-400 uppercase tracking-wider pt-2">Admin Account</p>
						{field("Your Name", "text", adminName, setAdminName, "Full name")}
						{field("Email", "email", adminEmail, setAdminEmail, "you@company.com")}
						{field("Phone", "tel", adminPhone, setAdminPhone, "+1 (555) 000-0000", false)}
						{field("Password", "password", password, setPassword, "Min. 8 characters")}
						{field("Confirm Password", "password", confirmPassword, setConfirmPassword, "Repeat password")}

						{errorMessage && (
							<p className="text-red-500 text-sm">{errorMessage}</p>
						)}

						<button
							type="submit"
							className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 rounded-lg transition mt-2"
						>
							Create Account
						</button>

						<p className="text-sm text-gray-500 text-center">
							Already have an account?{" "}
							<Link to="/login" className="text-blue-600 hover:underline">Sign in</Link>
						</p>
					</form>
				)}

				{status === "loading" && (
					<div className="text-center py-6">
						<div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-6" />
						<h2 className="text-xl font-semibold text-gray-800">Setting up your account...</h2>
						<p className="text-gray-500 mt-2 text-sm">Just a moment.</p>
					</div>
				)}

				{status === "success" && (
					<div className="text-center py-6">
						<div className="w-14 h-14 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
							<svg className="w-7 h-7 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
								<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
							</svg>
						</div>
						<h2 className="text-xl font-semibold text-gray-800">Account Created!</h2>
						<p className="text-gray-500 mt-2 text-sm">Check your email to verify your account, then sign in.</p>
						<button
							onClick={() => navigate("/login")}
							className="mt-6 w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 rounded-lg transition"
						>
							Go to Login
						</button>
					</div>
				)}

				{status === "error" && (
					<div className="text-center py-6">
						<div className="w-14 h-14 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-6">
							<svg className="w-7 h-7 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
								<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
							</svg>
						</div>
						<h2 className="text-xl font-semibold text-gray-800">Registration Failed</h2>
						<p className="text-gray-500 mt-2 text-sm">{errorMessage}</p>
						<button
							onClick={() => { setStatus("input"); setErrorMessage(""); }}
							className="mt-6 w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 rounded-lg transition"
						>
							Try Again
						</button>
					</div>
				)}
			</div>
		</div>
	);
}
