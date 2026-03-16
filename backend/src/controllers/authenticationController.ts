import { ZodError } from "zod";
import { db } from "../db.js";
import bcrypt from "bcrypt";
import { createErrorResponse, ErrorCodes } from "../types/responses.js";
import { generateAccessToken, verifyToken } from "../services/jwtService.js";

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
export const login = async (email: string, password: string, role: string) => {
	try {
		// just for testing
		if (email === "user" && password === "") {
			const user = {
				id: "1",
				name: email,
				organization_id: "epic",
				title: "admin",
				description: "admin",
				email: email,
				phone: null,
				password: "",
				last_login: new Date(),
			};
			const accessToken = generateAccessToken(user, role);
			let AuthResponse = {
				token: accessToken,
				expiresIn: 3600,
				user: {
					uid: user.id,
					email: email,
					role: role,
				},
			};
			return { data: AuthResponse };
		}
		const isValidEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
		if (!isValidEmail) {
			return createErrorResponse(
				"INVALID_CREDENTIALS",
				"Invalid credentials",
			);
		}

		// ask if last login updates automatically or if I have to add that here
		const user =
			role === "dispatcher"
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
		let match = await bcrypt.compare(user.password, hashedPassword);

		if (!user || !match) {
			return createErrorResponse(
				ErrorCodes.INVALID_CREDENTIALS,
				"Invalid credentials",
			);
		}

		const accessToken = generateAccessToken(user, role);

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
	} catch (e) {
		if (e instanceof ZodError) {
			return {
				error: `Validation failed: ${e.issues
					.map((err) => err.message)
					.join(", ")}`,
			};
		}
		console.log(e);
		return createErrorResponse(
			ErrorCodes.SERVER_ERROR,
			"Internal server error",
		);
	}
};

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
// add toen to blakclist
export const logout = async (
	userData: JSON, // whatever user data is stored with the token
	token: string,
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
