import type { Request } from "express";

export interface UserContext {
	techId?: string;
	dispatcherId?: string;
	organizationId?: string;
	ipAddress?: string;
	userAgent?: string;
}

export const getUserContext = (req: Request): UserContext => {
	const userId = req.headers["x-user-id"] as string;
	const userType = req.headers["x-user-type"] as "tech" | "dispatcher";
	const userAgent = req.headers["user-agent"] || undefined;

	return {
		techId: userType === "tech" ? userId : undefined,
		dispatcherId: userType === "dispatcher" ? userId : undefined,
		ipAddress: undefined,
		userAgent,
	};
};
