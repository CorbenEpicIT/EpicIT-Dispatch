import { useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { resetPasswordCall } from "../api/authenticate";
import { useAuthStore } from "../auth/authStore";

export default function ResetPasswordPage() {
    const { login } = useAuthStore();
    const [searchParams] = useSearchParams();
    const [status, setStatus] = useState<"input" | "loading" | "success" | "error">("input");
    const navigate = useNavigate();
    const [newPassword, setNewPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [errorMessage, setErrorMessage] = useState("");

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (newPassword !== confirmPassword) {
            setErrorMessage("Passwords do not match.");
            return;
        }

        if (newPassword.length < 8) {
            setErrorMessage("Password must be at least 8 characters.");
            return;
        }

        if (!/[A-Z]/.test(newPassword)) {
            setErrorMessage("Password must contain at least one capital letter.");
            return;
        }

        if (!/[0-9]/.test(newPassword)) {
            setErrorMessage("Password must contain at least one number.");
            return;
        }

        if (!/[^A-Za-z0-9]/.test(newPassword)) {
            setErrorMessage("Password must contain at least one special character.");
            return;
        }

        const token = searchParams.get("token");
        const role = searchParams.get("role");
        if (!token) {
            setStatus("error");
            return;
        }
        if (!role) {
            setStatus("error");
            return;
        }
        
        setStatus("loading");
        try {
            const result = await resetPasswordCall(token, newPassword, role);
            const parts = result.token.split(".");
            const payload = JSON.parse(atob(parts[1]));
            const orgTimezone = payload.organization_timezone ?? "America/Chicago";
            login(payload.role, payload.email, payload.uid, payload.organization_id ?? null, orgTimezone, payload.permissions ?? []);
            navigate(payload.role === "technician" ? "/technician" : "/dispatch");
        } catch {
            setStatus("error");
        }
    };

    return (
        <div className="min-h-screen bg-gray-50 flex items-center justify-center">
            <div className="bg-white rounded-2xl shadow-md p-10 max-w-md w-full text-center">

                {status === "input" && (
                    <form onSubmit={handleSubmit} className="text-left">
                        <h2 className="text-xl font-semibold text-gray-800 mb-2 text-center">Reset Password</h2>
                        <p className="text-gray-500 text-sm mb-6 text-center">Enter your new password below.</p>

                        <div className="mb-4">
                            <label className="block text-xs font-medium text-gray-600 uppercase tracking-wider mb-1">
                                New Password
                            </label>
                            <input
                                type="password"
                                value={newPassword}
                                onChange={(e) => { setNewPassword(e.target.value); setErrorMessage(""); }}
                                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                                placeholder="Min. 8 characters"
                                required
                            />
                        </div>

                        <div className="mb-4">
                            <label className="block text-xs font-medium text-gray-600 uppercase tracking-wider mb-1">
                                Confirm Password
                            </label>
                            <input
                                type="password"
                                value={confirmPassword}
                                onChange={(e) => { setConfirmPassword(e.target.value); setErrorMessage(""); }}
                                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                                placeholder="Repeat new password"
                                required
                            />
                        </div>

                        {errorMessage && (
                            <p className="text-red-500 text-sm mb-4">{errorMessage}</p>
                        )}

                        <button
                            type="submit"
                            className="w-full bg-primary-hover hover:bg-blue-700 text-white font-medium py-2 rounded-lg transition"
                        >
                            Reset Password
                        </button>
                    </form>
                )}

                {status === "loading" && (
                    <>
                        <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-6" />
                        <h2 className="text-xl font-semibold text-gray-800">Resetting password...</h2>
                        <p className="text-gray-500 mt-2 text-sm">Please wait a moment.</p>
                    </>
                )}

                {status === "success" && (
                    <>
                        <div className="w-14 h-14 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
                            <svg className="w-7 h-7 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                            </svg>
                        </div>
                        <h2 className="text-xl font-semibold text-gray-800">Password Reset!</h2>
                        <p className="text-gray-500 mt-2 text-sm">Redirecting you to login in 3 seconds...</p>
                    </>
                )}

                {status === "error" && (
                    <>
                        <div className="w-14 h-14 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-6">
                            <svg className="w-7 h-7 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </div>
                        <h2 className="text-xl font-semibold text-gray-800">Reset Failed</h2>
                        <p className="text-gray-500 mt-2 text-sm">This link is invalid or has expired.</p>
                        <button
                            onClick={() => navigate("/login")}
                            className="mt-6 w-full bg-primary-hover hover:bg-blue-700 text-white font-medium py-2 rounded-lg transition"
                        >
                            Back to Login
                        </button>
                    </>
                )}

            </div>
        </div>
    );
}