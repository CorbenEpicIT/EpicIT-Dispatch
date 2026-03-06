import postmark, { TemplatedMessage } from "postmark";

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
