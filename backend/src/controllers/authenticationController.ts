import { ZodError } from "zod";
import { db } from "../db.js";
import bcrypt from "bcrypt";
import { createErrorResponse, ErrorCodes } from "../types/responses.js";
import { 
	generateAccessToken, 
	gererateRefreshToken, 
	verifyToken,
	verifyRefreshToken,
	generateOTPToken,
} from "../services/jwtService.js";
import { createOTP } from "../services/otpServce.js";
import { Response } from "express";
import {
	sendEmail,
	sendOTPEmail,
	sendPasswordResetEmail,
} from "../services/emailService.js";
import crypto from "crypto";

export interface UserContext {
	techId?: string;
	dispatcherId?: string;
	ipAddress?: string;
	userAgent?: string;
}

interface AuthResponse {
	token: string;
	expiresIn: number;
	tokenType: string;
	refreshToken?: string;
	user?: {
		email: string;
		role: string;
	};
}

// will only need email and password for now
// get organization by parsing email if needed
// might change later
export const login = async (
	res: Response, 
	email: string, 
	password: string, 
	role: string
) => {
	try {
		// just for testing
		if (email === "user" && password === "") {
			const user = {
				id: "0",
				name: email,
				organization_id: "epic",
				title: "admin",
				description: "admin",
				email: email,
				phone: null,
				password: "",
				last_login: new Date(),
			};
			const otp = await createOTP(user.id, role);

			const pendingToken = generateOTPToken(user, role);
			if (!pendingToken) {
				return createErrorResponse(ErrorCodes.SERVER_ERROR, "Error generating OTP token");
			}

			return { data: { pendingToken } };
			
			//return issueAuthTokens(res, user.id, role);
		}
		// user already has pending token and otp
		// resend the opt token to user
		/*if (req.header.authorization?.split(" ")[0] === "Bearer") {
			
		}*/
		const isValidEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
		if (!isValidEmail) {
			return createErrorResponse(
				"INVALID_CREDENTIALS",
				"Invalid credentials",
			);
		}
		
		// ask if last login updates automatically or if I have to add that here
		const user =
			role === "technician"
				? await db.technician.findUnique({
						where: {
							email: email,
						},
					})
				: await db.dispatcher.findUnique({
						where: {
							email: email,
						},
					});
		if (!user) {
			return createErrorResponse(
				ErrorCodes.INVALID_CREDENTIALS,
				"Invalid credentials",
			);
		}
		// if dispatcher, use role from db (admin or dispatch)
		const effectiveRole = "role" in user ? user.role : role;

		let match = await bcrypt.compare(password, user.password);
		if (!user || !match) {
			return createErrorResponse(
				ErrorCodes.INVALID_CREDENTIALS,
				"Invalid credentials",
			);
		}

		// First login: skip OTP and go straight to forced password reset
		if (!user.last_login) {
			return await issueAuthTokens(res, user.id, effectiveRole);
		}

		const otp = await createOTP(user.id, effectiveRole);

		const pendingToken = generateOTPToken(user, effectiveRole, otp);
		if (!pendingToken) {
			return createErrorResponse(ErrorCodes.SERVER_ERROR, "Error generating OTP token");
		}

		const sent = await sendOTPEmail(user.email, otp);
		if (!sent.success) {
			return createErrorResponse(ErrorCodes.SERVER_ERROR, "Error sending OTP email");
		}
		return { data: { pendingToken } };
	} catch (e) {
		if (e instanceof ZodError) {
			return {
				error: `Validation failed: ${e.issues
					.map((err) => err.message)
					.join(", ")}`,
			};
		}
		
		return createErrorResponse(
			ErrorCodes.SERVER_ERROR,
			"Internal server error",
		);
	}
};

export const issueAuthTokens = async (res: Response, userId: string, role: string) => {
	try {
		// get user by id
		const user =
			role === "technician"
				? await db.technician.findUnique({
						where: {
							id: userId,
						},
					})
				: await db.dispatcher.findUnique({
						where: {
							id: userId,
						},
					});
		if (!user) {
			return createErrorResponse(ErrorCodes.NOT_FOUND, "User not found");
		}

		// if last login is null, force password reset and generate reset token
		const forcePasswordReset = !user.last_login;
		let resetToken: string | undefined;
		const now = new Date();

		if (forcePasswordReset) {
			resetToken = crypto.randomBytes(32).toString("hex");
			const expiresAt = new Date(Date.now() + 60 * 60 * 1000);
			if (role === "technician") {
				await db.technician.update({
					where: { id: userId },
					data: { password_reset_token: resetToken, password_reset_token_expires_at: expiresAt, last_login: now },
				});
			} else {
				await db.dispatcher.update({
					where: { id: userId },
					data: { password_reset_token: resetToken, password_reset_token_expires_at: expiresAt, last_login: now },
				});
			}
		} else {
			if (role === "technician") {
				await db.technician.update({ where: { id: userId }, data: { last_login: now } });
			} else {
				await db.dispatcher.update({ where: { id: userId }, data: { last_login: now } });
			}
		}

		let orgTimezone: string | null = null;
		if (user.organization_id) {
			const org = await db.organization.findUnique({
				where: { id: user.organization_id },
				select: { timezone: true },
			});
			orgTimezone = org?.timezone ?? null;
		}
		const accessToken = generateAccessToken(user, role, orgTimezone);
		const refreshToken = gererateRefreshToken(user, role);
		// set refresh token in httpOnly cookie
		res.cookie("refreshToken", refreshToken, {
			httpOnly: true,
			secure: true,
			sameSite: "strict",
			maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
		});

		let AuthResponse = {
			token: accessToken,
			expiresIn: 3600,
			user: {
				uid: user.id,
				email: user.email,
				role: role,
			},
			forcePasswordReset,
			resetToken,
		};
		return { data: AuthResponse };
	}catch (e) {
		if (e instanceof ZodError) {
			return createErrorResponse(
				ErrorCodes.VALIDATION_ERROR,
				`Validation failed: ${e.issues.map((err) => err.message).join(", ")}`,
			);
		}
	}
}

// not sure what inputs will be needed for register
// email, password, and organization for now
// will change when i know more details
export const register = async (
	email: string,
	password: string,
	organization: string, // will change if I find an organization obj/interface
) => {
	try {
	} catch (e) {
		if (e instanceof ZodError) {
			return {
				err: `Validation failed: ${e.issues
					.map((err) => err.message)
					.join(", ")}`,
			};
		}
		return createErrorResponse(
			ErrorCodes.SERVER_ERROR,
			"Internal server error",
		);
	}
};

// invalidate session token and clear cookies
// access token is cleared on front end
export const logout = async (res: Response, userData: any, token: string) => {
	try {
		await db.jwt_refresh_token.deleteMany({ where: { token: token } });
		res.clearCookie("refreshToken");
	} catch (e) {
		if (e instanceof ZodError) {
			return {
				err: `Validation failed: ${e.issues
					.map((err) => err.message)
					.join(", ")}`,
			};
		}
		return createErrorResponse(
			ErrorCodes.SERVER_ERROR,
			"Internal server error",
		);
	}
};

// check if user has permission to do whatever they doing
// not to sure how to structure this yet
// just here if needed
export const checkRole = async (userData: UserContext) => {
	try {

	} catch (e) {
		if (e instanceof ZodError) {
			return {
				err: `Validation failed: ${e.issues
					.map((err) => err.message)
					.join(", ")}`,
			};
		}
		return createErrorResponse(
			ErrorCodes.SERVER_ERROR,
			"Internal server error",
		);
	}
};

export const checkToken = (token: string) => {
	return verifyToken(token);
};

export const checkRefreshToken = (token: string) => {
	return verifyRefreshToken(token);
}

export const requestPasswordReset = async (email: string, role: string) => {
	try {
		const user = role === "technician"
			? await db.technician.findUnique({ where: { email } })
			: await db.dispatcher.findUnique({ where: { email } });

		if (!user) {
			// for security, don't reveal if email exists or not
			return { err: "" };
		}

		const token = crypto.randomBytes(32).toString("hex");
		const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour from now

		await db.$transaction(async (tx) => {
			if (role === "technician") {
				await tx.technician.update({
					where: { email },
					data: {
						password_reset_token: token,
						password_reset_token_expires_at: expiresAt,
					},
				});
			} else {
				await tx.dispatcher.update({
					where: { email },
					data: {
						password_reset_token: token,
						password_reset_token_expires_at: expiresAt,
					},
				});
			}
		});

		const sent = await sendPasswordResetEmail(email, token, role);
		if (!sent.success) {
			return { err: "Error sending password reset email" };
		}
		return { err: "" };
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

export const resetPassword = async (token: string, newPassword: string, role: string) => {
	try {
		const isDispatcher = role !== "technician";
		const user = isDispatcher
			? await db.dispatcher.findFirst({ where: { password_reset_token: token } })
			: await db.technician.findFirst({ where: { password_reset_token: token } });

		if (!user || !user.password_reset_token_expires_at || user.password_reset_token_expires_at < new Date()) {
			return { err: "Invalid or expired token" };
		}

		const hashedPassword = await bcrypt.hash(newPassword, 10);
		await db.$transaction(async (tx) => {
			if (isDispatcher) {
				await tx.dispatcher.update({
					where: { password_reset_token: token },
					data: {
						password: hashedPassword,
						password_reset_token: null,
						password_reset_token_expires_at: null,
					},
				});
			}else{
				await tx.technician.update({
					where: { password_reset_token: token },
					data: {
						password: hashedPassword,
						password_reset_token: null,
						password_reset_token_expires_at: null,
					},
				});
			}
		});
		return { err: "" };
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