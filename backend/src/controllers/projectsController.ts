import { ZodError } from "zod";
import { getScopedDb, type UserContext } from "../lib/context.js";
import { Prisma } from "../../generated/prisma/client.js";
import {
    createProjectSchema,
    updateProjectSchema,
    attachJobSchema,
} from "../lib/validate/projects.js";
import { Request } from "express";
import { logActivity, buildChanges } from "../services/logger.js";
import { log } from "../services/appLogger.js";
import { generateProjectNumber } from "../db.js";

// ============================================================================
// Project CRUD
// ============================================================================

export const getProjects = async (orgId: string) => {
    const sdb = getScopedDb(orgId);
    return await sdb.project.findMany({
        include: {
            client: { select: { id: true, name: true } },
            manager_dispatcher: { select: { id: true, name: true } },
            jobs:   {
                select: {
                    id: true,
                    job_number: true,
                    name: true,
                    status: true,
                    priority: true,
                    estimated_total: true,
                    actual_total: true,
                    client: { select: { id: true, name: true } },
                }
            },
        },
        orderBy: { created_at: "desc" },
    });
}

export const getProjectById = async (orgId: string, id: string) => {
    const sdb = getScopedDb(orgId);
    return await sdb.project.findFirst({
        where: { id },
        include: {
            client: { select: { id: true, name: true } },
            manager_dispatcher: { select: { id: true, name: true } },
            jobs:   {
                select: {
                    id: true,
                    job_number: true,
                    name: true,
                    status: true,
                    priority: true,
                    estimated_total: true,
                    actual_total: true,
                    client: { select: { id: true, name: true } },
                }
            },
        },
    });
}

export const getProjectsByClientId = async (orgId: string, clientId: string) => {
    const sdb = getScopedDb(orgId);
    return await sdb.project.findMany({
        where: { client_id: clientId },
        include: {
            client: { select: { id: true, name: true } },
            jobs:   {
                select: {
                    id: true,
                    job_number: true,        
                    name: true,
                    status: true,            
                    priority: true,  
                    estimated_total: true,
                    actual_total: true,
                    client: { select: { id: true, name: true } },
                } 
            },
            manager_dispatcher: {
                select: {
                    id: true,
                    name: true
                }
            }
        },
        orderBy: { created_at: "desc" },
    });
}

export const insertProject = async (req: Request, context?: UserContext) => {
    try {
        const parsed = createProjectSchema.parse(req.body);
        const orgId = req.user!.organization_id as string;
        const sdb = getScopedDb(orgId);

        let created: Awaited<ReturnType<typeof sdb.project.create>> | undefined;
        // try 5 times in case of 2 concurrent creates that generate the same project number
        for (let i = 0; i < 5; i++) { 
            try {
                created = await sdb.$transaction(async (tx) => {
                    const client = await tx.client.findFirst({ where: { id: parsed.client_id }});
                    if (!client) {
                        throw new Error("Client not found");
                    }
                    if (parsed.manager_dispatcher_id) {
                        const dispatcher = await tx.dispatcher.findFirst({ where: {id: parsed.manager_dispatcher_id}});
                        if (!dispatcher) {
                            throw new Error("Dispatcher not found");
                        }
                    }
                    
                    const projectNumber = await generateProjectNumber(tx, orgId);
                    const project = await tx.project.create({
                        data: {
                            name: parsed.name,
                            description: parsed.description,
                            client_id: parsed.client_id,
                            status: parsed.status,
                            priority: parsed.priority,
                            address: parsed.address,
                            coords: parsed.coords,
                            budget: parsed.budget,
                            starts_at: parsed.starts_at,
                            target_end_at: parsed.target_end_at,
                            project_number: projectNumber,
                            organization_id: orgId,
                            manager_dispatcher_id: parsed.manager_dispatcher_id
                        }
                    });

                    await logActivity({
                        event_type: "project.created",
                        action: "created",
                        entity_type: "project",
                        entity_id: project.id,
                        organization_id: orgId,
                        actor_type: context?.techId
                            ? "technician"
                            : context?.dispatcherId
                                ? "dispatcher"
                                : "system",
                        actor_id: context?.techId || context?.dispatcherId,
                        changes: {
                            project_number: { old: null, new: project.project_number },
                            name: { old: null, new: project.name },
                            description: { old: null, new: project.description },
                            status: { old: null, new: project.status },
                            priority: { old: null, new: project.priority },
                            address: { old: null, new: project.address },
                            coords: { old: null, new: project.coords },
                            budget: { old: null, new: project.budget },
                            starts_at: { old: null, new: project.starts_at },
                            target_end_at: { old: null, new: project.target_end_at },
                            manager_dispatcher_id: { old: null, new: project.manager_dispatcher_id}
                        },
                        ip_address: context?.ipAddress,
                        user_agent: context?.userAgent,
                    });
                    return project;
                });
                break;
            } catch (error) {
                if (i < 4 && error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
                    continue;
                }
                throw error;
            }
        }

    return { err: "", project: created ?? undefined };

    }catch (err){
        if (err instanceof ZodError) {
			return {
				err: `Validation failed: ${err.issues
					.map((e) => e.message)
					.join(", ")}`,
			};
		}
		if (err instanceof Error) {
			return { err: err.message };
		}
		log.error({ err: err }, "Insert project error");
		return { err: "Internal server error" };
    }
}

export const updateProject = async (req: Request, context?: UserContext) => {
    try {
        const id = req.params.id as string;
        const parsed = updateProjectSchema.parse(req.body);
        const orgId = req.user!.organization_id as string;
        const sdb = getScopedDb(orgId);

        const existing = await sdb.project.findFirst({ where: { id }});
        if (!existing) {
            throw new Error("Project not found");
        }

        if (parsed.manager_dispatcher_id) {
            const dispatcher = await sdb.dispatcher.findFirst({ where: {id: parsed.manager_dispatcher_id}});
            if (!dispatcher) {
                throw new Error("Dispatcher not found");
            }
        }


        const updated = await sdb.$transaction(async (tx) => {
            const project = await tx.project.update({
                where: { id },
                data: {
                    name: parsed.name,
                    description: parsed.description,
                    client_id: parsed.client_id,
                    status: parsed.status,
                    priority: parsed.priority,
                    address: parsed.address,
                    coords: parsed.coords,
                    budget: parsed.budget,
                    starts_at: parsed.starts_at,
                    target_end_at: parsed.target_end_at,
                    cancellation_reason: parsed.cancellation_reason,
                    manager_dispatcher_id: parsed.manager_dispatcher_id
                }
            });
            await logActivity({
                event_type: "project.updated",
                action: "updated",
                entity_type: "project",
                entity_id: project.id,
                organization_id: orgId,
                actor_type: context?.techId
                    ? "technician"
                    : context?.dispatcherId
                        ? "dispatcher"
                        : "system",
                actor_id: context?.techId || context?.dispatcherId,
                changes: buildChanges(existing, project, [
                    "name",
                    "description",
                    "client_id",
                    "status",
                    "priority",
                    "address",
                    "coords",
                    "budget",
                    "starts_at",
                    "target_end_at",
                    "cancellation_reason",
                    "manager_dispatcher_id"
                ]),
                ip_address: context?.ipAddress,
                user_agent: context?.userAgent,
            });
            return project;
        });

        return { err: "", project: updated ?? undefined };
    } catch ( error) {
        if (error instanceof ZodError) {
            return {
                err: `Validation failed: ${error.issues
                    .map((e) => e.message)
                    .join(", ")}`,
            };
        }
        if (error instanceof Error) {
            return { err: error.message };
        }
        log.error({ err: error }, "Update project error");
        return { err: "Internal server error" };
    }
}

export const deleteProject = async (orgId: string, id: string, context?: UserContext) => {
    try {
        const sdb = getScopedDb(orgId);
        const existing = await sdb.project.findFirst({ where: { id }});
        if (!existing) {
            return { err: "Project not found" };
        }

        await sdb.$transaction(async (tx) => {
            await tx.project.delete({
                where: {id}
            });
            await logActivity({
                event_type: "project.deleted",
				action: "deleted",
				entity_type: "project",
				entity_id: id,
				organization_id: orgId,
				actor_type: context?.techId
					? "technician"
					: context?.dispatcherId
						? "dispatcher"
						: "system",
				actor_id: context?.techId || context?.dispatcherId,
				changes: {
					project_number: { old: existing?.project_number, new: null },
					name: { old: existing?.name, new: null },
					status: { old: existing?.status, new: null },
				},
				ip_address: context?.ipAddress,
				user_agent: context?.userAgent,
            })
        })

        return { err: "" };
    } catch(error) {
        if (error instanceof ZodError) {
            return {
                err: `Validation failed: ${error.issues
                    .map((e) => e.message)
                    .join(", ")}`,
            };
        }
        if (error instanceof Error) {
            return { err: error.message };
        }
        log.error({ err: error }, "Delete project error");
        return { err: "Internal server error" };
    }
}

export const attachJob = async (req: Request, context?: UserContext) => {
    try {
        const projectId = req.params.id as string;
        const orgId = req.user!.organization_id as string;

        const sdb = getScopedDb(orgId);
        const project = await sdb.$transaction(async (tx) => {
            const project = await tx.project.findFirst({ where: { id: projectId }});
            if (!project) {
                throw new Error("Project not found");
            }

            const { jobId } = attachJobSchema.parse(req.body);
            const job = await tx.job.findFirst({ where: { id: jobId }});
            if (!job) {
                throw new Error("Job not found");
            }
            if (job.project_id === projectId) {
                return project;
            }
            if (job.project_id !== null)
                throw new Error("Job is already attached to another project");

            await tx.job.update({
                where: { id: jobId },
                data: { project_id: projectId }
            });
            await logActivity({
                event_type: "project.job_attached",
                action: "attached",
                entity_type: "job",
                entity_id: jobId,
                organization_id: orgId,
                actor_type: context?.techId
                    ? "technician"
                    : context?.dispatcherId
                        ? "dispatcher"
                        : "system",
                actor_id: context?.techId || context?.dispatcherId,
                changes: {
                    project_id: { old: job.project_id, new: projectId },
                },
                ip_address: context?.ipAddress,
                user_agent: context?.userAgent,
            });
            return project;
        });
        return { err: "", project };
    } catch (error) {
        if (error instanceof ZodError) {
            return {
                err: `Validation failed: ${error.issues
                    .map((e) => e.message)
                    .join(", ")}`,
            };
        }
        if (error instanceof Error) {
            return { err: error.message };
        }
        log.error({ err: error }, "Attach job to project error");
        return { err: "Internal server error" };
    } 
}

export const detachJob = async (req: Request, context?: UserContext) => {
    try {
        const projectId = req.params.id as string;
        const jobId = req.params.jobId as string;
        const orgId = req.user!.organization_id as string;

        const sdb = getScopedDb(orgId);
        const job = await sdb.$transaction(async (tx) => {
            const project = await tx.project.findFirst({ where: { id: projectId }});
            if (!project) {
                throw new Error("Project not found");
            }
            const job = await tx.job.findFirst({ where: { id: jobId }});
            if (!job) {
                throw new Error("Job not found");
            }
            if (job.project_id !== projectId) {
                throw new Error("Job is not attached to this project");
            }
            await tx.job.update({
                where: { id: jobId },
                data: { project_id: null }
            });
            await logActivity({
                event_type: "project.job_detached",
                action: "detached",
                entity_type: "job",
                entity_id: jobId,
                organization_id: orgId,
                actor_type: context?.techId
                    ? "technician"
                    : context?.dispatcherId
                        ? "dispatcher"
                        : "system",
                actor_id: context?.techId || context?.dispatcherId,
                changes: {
                    project_id: { old: job.project_id, new: null },
                },
                ip_address: context?.ipAddress,
                user_agent: context?.userAgent,
            })
            return job;
        });
        return { err: "", job }; 
    } catch (error) {
        if (error instanceof ZodError) {
            return {
                err: `Validation failed: ${error.issues
                    .map((e) => e.message)
                    .join(", ")}`,
            };
        }
        if (error instanceof Error) {
            return { err: error.message };
        }
        log.error({ err: error }, "Detach job from project error");
        return { err: "Internal server error" };
    }
}

