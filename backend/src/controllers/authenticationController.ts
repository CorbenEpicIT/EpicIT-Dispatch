import { date, ZodError } from "zod";
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
//import { ref } from "process";
import { Response } from "express";
import {
	sendEmail,
	sendOTPEmail,
} from "../services/emailService.js";

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
			role === "dispatch"
				? await db.dispatcher.findUnique({
						where: {
							email: email,
						},
					})
				: await db.technician.findUnique({
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

		let hashedPassword = await bcrypt.hash(password, 10);
		let pass = await bcrypt.hash("password", 10);
		console.log(pass, hashedPassword);
		let match = await bcrypt.compare(password, user.password);
		if (!user || !match) {
			return createErrorResponse(
				ErrorCodes.INVALID_CREDENTIALS,
				"Invalid credentials",
			);
		}

		const otp = await createOTP(user.id, role);

		const pendingToken = generateOTPToken(user, role);
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
		// get user by id and role
		if (userId === "0") {
			const user =
		    	role === "dispatch" ? {
					id: userId,
					name: "user",
					organization_id: "1",
					title: "admin",
					description: "user for testing",
					email: "user@domain.com",
					phone: null,
					password: "",
					last_login: new Date(),
				} : {
					id: userId,
					name: "user",
					organization_id: "1",
					title: "tech",
					description: "user for testing",
					email: "user@domain.com",
					phone: null,
					password: "",
					last_login: new Date(),
				}
			const accessToken = generateAccessToken(user, role);
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
					uid: userId,
					email: "user",
					role: role,
				},
			};
			return { data: AuthResponse };
		}
		const user =
			role === "dispatch"
				? await db.dispatcher.findUnique({
						where: {
							id: userId,
						},
					})
				: await db.technician.findUnique({
						where: {
							id: userId,
						},
					});
		if (!user) {
			return createErrorResponse(ErrorCodes.NOT_FOUND, "User not found");
		}
		const accessToken = generateAccessToken(user, role);
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