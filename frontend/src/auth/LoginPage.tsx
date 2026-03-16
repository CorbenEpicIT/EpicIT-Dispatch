import { useNavigate } from "react-router-dom";
import { useAuthStore } from "./authStore";
import { useState } from "react";
import { loginCall } from "../api/authenticate.ts"

export default function LoginPage() {
	const { login } = useAuthStore();
	const [role, setRole] = useState<"dispatch" | "technician">("dispatch");
	const [name, setName] = useState("user");
	const [password, setPassword] = useState("");
	const navigate = useNavigate();

	const handleLogin = async (e: React.FormEvent) => {
		e.preventDefault();
		try {
			const result = await loginCall({ email: name, password: password, role: role });
			console.log(result);
			
			login(role, name || "User");
			
			if (role === "dispatch") navigate("/dispatch");
			else navigate("/technician");
		} catch (error) {
			console.error("Login failed:", error);
		}
	};

	return (
		<div className="flex h-screen items-center justify-center bg-gray-100">
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
		</div>
	);
}
