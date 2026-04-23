import { ZodError } from "zod";
import { getScopedDb, type UserContext } from "../lib/context.js";
import bcrypt from "bcrypt";
import { randomBytes, randomUUID } from "crypto";
import {
    createDispatcherSchema,
    updateDispatcherSchema,
} from "../lib/validate/dispatchers.js";
import { logActivity, buildChanges } from "../services/logger.js";
import { log } from "../services/appLogger.js";
import { sendEmailVerificationEmail } from "../services/emailService.js";


export const getAllDispatchers = async (organizationId: string) => {
	const sdb = getScopedDb(organizationId);
    return await sdb.dispatcher.findMany({
        include: {

        },
    });
};

export const getDispatcherById = async (id: string, organizationId: string) => {
	const sdb = getScopedDb(organizationId);
    return await sdb.dispatcher.findFirst({
        where: { id },
        /*include: {
            Default for now
        },*/
    });
};

export const insertDispatcher = async (
    data: unknown,
    organizationId: string,
    context?: UserContext
) => {
    try {
        const parsed = createDispatcherSchema.parse(data);
        const sdb = getScopedDb(organizationId);
        const existing = await sdb.dispatcher.findFirst({
            where: { email: parsed.email },
        });

        if (existing) {
            return { err: "Email already exists" };
        }

        const tempPassword = randomBytes(8).toString("hex") + "A1!";
        const hashedPassword = await bcrypt.hash(tempPassword, 10);

        const created = await sdb.$transaction(async (tx) => {
            const dispatcher = await tx.dispatcher.create({
                data: {
                    ...parsed,
                    organization_id: organizationId,
                    password: hashedPassword,
                    email_verification_token: randomUUID(),
                },
                include: {
                    // not sure what needs to be included yet
                },
            });

            await logActivity({
                event_type: "dispatcher.created",
                action: "created",
                entity_type: "dispatcher",
                entity_id: dispatcher.id,
                organization_id: organizationId,
                actor_type: context?.techId
                    ? "technician"
                    : context?.dispatcherId
                    ? "dispatcher"
                    : "system",
                actor_id: context?.techId || context?.dispatcherId,
                changes: {
                    name: { old: null, new: dispatcher.name },
                    email: { old: null, new: dispatcher.email },
                    phone: { old: null, new: dispatcher.phone },
                    title: { old: null, new: dispatcher.title },
                },
                ip_address: context?.ipAddress,
                user_agent: context?.userAgent,
            });

            sendEmailVerificationEmail(dispatcher.email, dispatcher.email_verification_token!, tempPassword);

            return dispatcher;
        });

        return { err: "", item: created };
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
    id : string,
    data: unknown,
    organizationId: string,
    context?: UserContext
) => {
    try {
        const parsed = updateDispatcherSchema.parse(data);

        const sdb = getScopedDb(organizationId);
        const existing = await sdb.dispatcher.findFirst({
            where: { id },
        });

        if (!existing) {
            return { err: "Dispatcher not found" };
        }

        if (parsed.email && parsed.email !== existing.email) {
            const emailTaken = await sdb.dispatcher.findFirst({
                where: { email: parsed.email },
            });

            if (emailTaken) {
                return { err: "Email already exists" };
            }
        }

        const changes = buildChanges(existing, parsed, [
            "name",
            "email",
            "phone",
            "title",
            "description",
            "role",
            "last_login",
        ] as const);

        const updated = await sdb.$transaction(async (tx) => {
            const dispatcher = await tx.dispatcher.update({
                where: { id },
                data: parsed,
                include: {
                    // not sure what needs to be included yet
                },
            });

            if (Object.keys(changes).length > 0) {
                await logActivity({
                    event_type: "dispatcher.updated",
                    action: "updated",
                    entity_type: "dispatcher",
                    entity_id: id,
                    organization_id: organizationId,
                    actor_type: context?.techId
                        ? "technician"
                        : context?.dispatcherId
                        ? "dispatcher"
                        : "system",
                    actor_id: context?.techId || context?.dispatcherId,
                    changes,
                    ip_address: context?.ipAddress,
                    user_agent: context?.userAgent,
                });
            }

            return dispatcher;
        });

        return { err: "", item: updated };
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

export const deleteDispatcher = async (id: string, organization_id: string, context?: UserContext) => {
    try {
        const sdb = getScopedDb(organization_id);
        const user = await sdb.dispatcher.findFirst({
            where: { id },
        });

        if (!user) {
            return { err: "Dispatcher not found" };
        }

        await sdb.$transaction(async (tx) => {
            await tx.dispatcher.delete({
                where: { id },
            });

            await logActivity({
                event_type: "dispatcher.deleted",
                action: "deleted",
                entity_type: "dispatcher",
                entity_id: id,
                organization_id: organization_id,
                actor_type: context?.techId
                    ? "technician"
                    : context?.dispatcherId
                    ? "dispatcher"
                    : "system",
                actor_id: context?.techId || context?.dispatcherId,
                changes: {
                    name: { old: user.name, new: null },
                    email: { old: user.email, new: null },
                    phone: { old: user.phone, new: null },
                    title: { old: user.title, new: null },
                },
                ip_address: context?.ipAddress,
                user_agent: context?.userAgent,
            });
        });
    } catch (error) {
        log.error({ err: error }, "Error deleting dispatcher");
        return { err: "Internal server error" };
    }
};
