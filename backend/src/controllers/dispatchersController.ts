import { ZodError } from "zod";
import { getScopedDb, type UserContext } from "../lib/context.js";
import bcrypt from "bcryptjs";
import { randomBytes, randomUUID } from "crypto";
import {
    createDispatcherSchema,
    updateDispatcherSchema,
    changePasswordSchema
} from "../lib/validate/dispatchers.js";
import { logActivity, buildChanges } from "../services/logger.js";
import { log } from "../services/appLogger.js";
import { sendEmailVerificationEmail } from "../services/emailService.js";
import { getAllPermissions } from "../lib/permissionCatalogs.js";


export const getAllDispatchers = async (organizationId: string) => {
	const sdb = getScopedDb(organizationId);
    return await sdb.dispatcher.findMany({
        include: {
            organization_role: { select: { id: true, name: true } },
        },
    });
};

export const getDispatcherById = async (id: string, organizationId: string) => {
	const sdb = getScopedDb(organizationId);
    const dispatcher = await sdb.dispatcher.findFirst({
        where: { id },
        include: {
            organization_role: { select: { id: true, name: true, permissions: true } },
        },
    });
    if (!dispatcher) return null;
    const permissions: string[] =
        dispatcher.role === "admin"
            ? getAllPermissions("dispatcher")
            : (dispatcher.organization_role?.permissions as string[] | null) ?? [];
    return { ...dispatcher, permissions };
};

export const insertDispatcher = async (
    data: unknown,
    organizationId: string,
    context?: UserContext
) => {
    try {
        const parsed = createDispatcherSchema.parse(data);
        const passwordProvided = parsed.password ? true : false;
        const sdb = getScopedDb(organizationId);
        const existing = await sdb.dispatcher.findFirst({
            where: { email: parsed.email },
        });

        if (existing) {
            return { err: "Email already exists" };
        }
        // if no password provided, generate a random one and email it to them
        const tempPassword = passwordProvided ? parsed.password! : randomBytes(8).toString("hex") + "A1!";
        const hashedPassword = await bcrypt.hash(tempPassword, 10);

        const created = await sdb.$transaction(async (tx) => {
            const { password: _pw, ...parsedWithoutPassword } = parsed;
            const dispatcher = await tx.dispatcher.create({
                data: {
                    ...parsedWithoutPassword,
                    organization_id: organizationId,
                    password: hashedPassword,
                    email_verification_token: randomUUID(),
                    // if password provided dispatcher doesn't need to reset password on first login
                    ...(passwordProvided && { last_login: new Date() }),
                },
                include: {
                    // not sure if anything needs to be included 
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

            sendEmailVerificationEmail(
                dispatcher.email, 
                dispatcher.email_verification_token!, 
                passwordProvided ? undefined : tempPassword
            );

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
            "theme",
        ] as const);

        const updated = await sdb.$transaction(async (tx) => {
            const dispatcher = await tx.dispatcher.update({
                where: { id },
                data: parsed,
                include: {
                    // Nothing needed to be included for now
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

        return { message: "Dispatcher deleted successfully" };
    } catch (error) {
        log.error({ err: error }, "Error deleting dispatcher");
        return { err: "Internal server error" };
    }
};

export const changeDispatcherPassword = async (
    id: string, 
    organization_id: string, 
    data: unknown, 
    context?: UserContext
) => {
    const parsed = changePasswordSchema.parse(data);
    const sdb = getScopedDb(organization_id);
    const dispatcher = await sdb.dispatcher.findFirst({
        where: { id },
    });

    if (!dispatcher) {
        return { err: "Dispatcher not found" };
    }

    const valid = await bcrypt.compare(parsed.current_password, dispatcher.password);
    if (!valid) {
        return { err: "Current password is incorrect" };
    }
    const hashedPassword = await bcrypt.hash(parsed.new_password, 10);
    await sdb.$transaction(async (tx) => {
        await tx.dispatcher.update({
            where: { id },
            data: {
                password: hashedPassword,
            },
        });

        await logActivity({
            event_type: "dispatcher.password.changed",
            action: "changed",
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
                password: { old: dispatcher.password, new: hashedPassword },
            },
            ip_address: context?.ipAddress,
            user_agent: context?.userAgent,
        });
    });
    return { message: "Password updated successfully", err: ""};
};