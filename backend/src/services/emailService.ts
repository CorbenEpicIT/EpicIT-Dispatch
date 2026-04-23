import postmark, { TemplatedMessage } from "postmark";
import { db } from "../db.js";
import { create } from "node:domain";
import { createErrorResponse, createSuccessResponse, ErrorCodes } from "../types/responses.js";


const POSTMARK_FROM_EMAIL = process.env.POSTMARK_FROM_EMAIL;
if (!POSTMARK_FROM_EMAIL) throw new Error("POSTMARK_FROM_EMAIL is not set");

const POSTMARK_API_KEY = process.env.POSTMARK_API_KEY;
if (!POSTMARK_API_KEY) throw new Error("POSTMARK_API_KEY is not set");

const client = new postmark.ServerClient(POSTMARK_API_KEY);

export const sendEmail = async (
	to: string,
	templateAlias: string,
	templateModel: Record<string, unknown>,
) => {
	try {
		await client.sendEmailWithTemplate({
			From: POSTMARK_FROM_EMAIL,
			To: to,
			TemplateAlias: templateAlias,
			MessageStream: "outbound",
			TemplateModel: templateModel,
		} as TemplatedMessage);
	} catch (error) {
		console.error(error);
	}
};

// if you'd like, feel free to add additional functions for common email templates

//temp function since I can't make a template rn
const generateOTPEmail = (otp: string): string => `
  <!DOCTYPE html>
  <html>
    <body style="font-family: Arial, sans-serif; background-color: #f4f4f4; padding: 40px;">
      <div style="max-width: 480px; margin: 0 auto; background: white; border-radius: 8px; padding: 32px;">
        
        <h2 style="color: #1a1a1a; margin-bottom: 8px;">Verification Code</h2>
        <p style="color: #555; margin-bottom: 24px;">
          Use the code below to complete your sign in. It expires in 5 minutes.
        </p>

        <div style="
          font-size: 36px;
          font-weight: bold;
          letter-spacing: 12px;
          color: #2563eb;
          background: #eff6ff;
          border-radius: 8px;
          padding: 16px;
          text-align: center;
          margin-bottom: 24px;
        ">
          ${otp}
        </div>

        <p style="color: #999; font-size: 13px;">
          If you didn't request this code, you can safely ignore this email.
        </p>

      </div>
    </body>
  </html>
`;
export const sendOTPEmail = async (to: string, otp: string) => {
	try {
		// sendEmail(to, "otp-verification", { otp });
		await client.sendEmail({
			From: POSTMARK_FROM_EMAIL,
			To: to,
			Subject: 'Your verification code',
			HtmlBody: generateOTPEmail(otp),
			TextBody: `Your verification code is: ${otp}. It expires in 5 minutes.`, // fallback for email clients that don't support HTML
			MessageStream: 'outbound',
		});
		return createSuccessResponse(null);
	} catch (error) {
		console.error(error);
		return createErrorResponse(ErrorCodes.SERVER_ERROR, "Error sending OTP email");
	}
};