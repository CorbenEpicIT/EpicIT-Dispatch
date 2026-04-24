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
            setTimeout(() => navigate("/login"), 3000); // redirect after 3 seconds
        } catch {
            setStatus("error");
        }
        };

        verify();
    }, []);

    if (status === "loading") return <p>Verifying your email...</p>;
    if (status === "success") return <p>Email verified! Redirecting to login...</p>;
    return <p>Invalid or expired verification link.</p>;
}
