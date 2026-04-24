import { ZodError } from "zod";
import { db } from "../db.js";
import { sendEmailVerificationEmail } from "../services/emailService.js";
import { create } from "domain";
import { createErrorResponse, createSuccessResponse, ErrorCodes } from "../types/responses.js";

export const verifyEmail = async (token: string) => {
    try {
        const dispatcher = await db.dispatcher.findFirst({
            where: { email_verification_token: token },
        });

        if (!dispatcher) {
            return createErrorResponse(ErrorCodes.INVALID_TOKEN, "Invalid or expired token");
        }

        await db.dispatcher.update({
            where: { id: dispatcher.id },
            data: { email_verified_at: new Date(), email_verification_token: null },
        });

        return { message: "Email verified successfully" };
    }catch (e) {
        if (e instanceof ZodError) {
            return {
                err: `Validation failed: ${e.issues
                    .map((err) => err.message)
                    .join(", ")}`,
            };
        }
        return { err: "Internal server error" };
    }
};