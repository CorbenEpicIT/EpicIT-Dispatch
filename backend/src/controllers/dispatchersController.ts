import { ZodError } from "zod";
import { db } from "../db.js";
import {
    createDispatcherSchema,
    updateDispatcherSchema,
} from "../lib/validate/dispatchers.js";
import { logActivity, buildChanges } from "../services/logger.js";
import { log } from "../services/appLogger.js";

export interface UserContext {
	techId?: string;
	dispatcherId?: string;
	ipAddress?: string;
	userAgent?: string;
}


export const getAllDispatchers = async () => {
    return await db.dispatcher.findMany({
        where:{
            // organization_id: context?.organizationId,
            // for now won't check orgs but will need to later
        },
        include: {
            
        },
    });
};

export const getDispatcherById = async (id: string) => {
    return await db.dispatcher.findUnique({
        where: { id },
        include: {
            
        },
    });
};

export const insertDispatcher = async (
    data: unknown,
    context?: UserContext
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
        log.error({ err: e }, "Error inserting dispatcher");
        return { err: "Internal server error" };
    }
};

export const updateDispatcher = async (
    id: string,
    data: unknown,
    context?: UserContext
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
        log.error({ err: e }, "Error updating dispatcher");
        return { err: "Internal server error" };
    }
};

export const updateDispatcherLocation = async (
    id: string,
    data: unknown,
    context?: UserContext
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
        log.error({ err: e }, "Error updating dispatcher");
        return { err: "Internal server error" };
    }
};

export const deleteDispatcher = async (id: string, context?: UserContext) => {
    try {
        
    } catch (error) {
        log.error({ err: error }, "Error deleting dispatcher");
        return { err: "Internal server error" };
    }
};
