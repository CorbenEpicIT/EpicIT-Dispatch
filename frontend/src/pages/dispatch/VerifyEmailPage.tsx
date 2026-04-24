import { useEffect, useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { verifyEmail } from "../../api/email";

export default function VerifyEmail() {
    const [searchParams] = useSearchParams();
    const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
    const navigate = useNavigate();

    useEffect(() => {
        const verify = async () => {
            const token = searchParams.get("token");

            if (!token) {
                setStatus("error");
                return;
            }

            try {
                await verifyEmail(token);
                setStatus("success");
                setTimeout(() => navigate("/login"), 3000);
            } catch {
                setStatus("error");
            }
        };

        verify();
    }, []);

    return (
        <div className="min-h-screen bg-gray-50 flex items-center justify-center">
            <div className="bg-white rounded-2xl shadow-md p-10 max-w-md w-full text-center">

                {status === "loading" && (
                    <>
                        <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-6" />
                        <h2 className="text-xl font-semibold text-gray-800">Verifying your email...</h2>
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
                        <h2 className="text-xl font-semibold text-gray-800">Email Verified!</h2>
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
                        <h2 className="text-xl font-semibold text-gray-800">Verification Failed</h2>
                        <p className="text-gray-500 mt-2 text-sm">This link is invalid or has expired.</p>
                        <button
                            onClick={() => navigate("/login")}
                            className="mt-6 w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 rounded-lg transition"
                        >
                            Back to Login
                        </button>
                    </>
                )}

            </div>
        </div>
    );
}