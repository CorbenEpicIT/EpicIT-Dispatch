import { ZodError } from "zod";
import bcrypt from "bcrypt";
import { randomUUID } from "crypto";
import { log } from "../services/appLogger.js";
import { sendEmailVerificationEmail } from "../services/emailService.js";
import { registerOrganizationSchema } from "../lib/validate/organizations.js";
import { db } from '../db.js';

export const registerOrganization = async (data: unknown) => {
	try {
		const parsed = registerOrganizationSchema.parse(data);
		const existing = await db.dispatcher.findUnique({
			where: { email: parsed.admin_email },
		});

		if (existing) {
			return { err: "An account with this email already exists" };
		}

		const hashedPassword = await bcrypt.hash(parsed.admin_password, 10);
		const verificationToken = randomUUID();

		const result = await db.$transaction(async (tx) => {
			const org = await tx.organization.create({
				data: {
					name: parsed.org_name,
					email: parsed.admin_email,
					phone: parsed.admin_phone ?? null,
				},
			});

			const admin = await tx.dispatcher.create({
				data: {
					organization_id: org.id,
					name: parsed.admin_name,
					email: parsed.admin_email,
					phone: parsed.admin_phone ?? null,
					password: hashedPassword,
					role: "admin",
					title: "Administrator",
					description: "",
					email_verification_token: verificationToken,
					last_login: new Date(),
				},
			});

			return { org, admin };
		});

		sendEmailVerificationEmail(result.admin.email, verificationToken);

		const { org, admin } = result;
		const { password: _pw, email_verification_token: _token, ...safeAdmin } = admin;

		return { err: "", item: { org, admin: safeAdmin } };
	} catch (e) {
		if (e instanceof ZodError) {
			return {
				err: `Validation failed: ${e.issues.map((i) => i.message).join(", ")}`,
			};
		}
		log.error({ err: e }, "Error registering organization");
		return { err: "Internal server error" };
	}
};
