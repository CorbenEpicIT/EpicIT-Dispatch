import { Router, type Request } from "express";
import { z } from "zod";
import { buildAgentContext } from "../agent/context.js";
import { READ_ONLY_POLICY } from "../agent/policy.js";
import { describeTools } from "../agent/registry.js";
import type { AgentContext } from "../agent/types.js";
import { getScopedDb } from "../lib/context.js";
import { log } from "../services/appLogger.js";
import { createErrorResponse, createSuccessResponse, ErrorCodes } from "../types/responses.js";
import {
	ASSISTANT_MODEL,
	assistantUnavailableReason,
	isAssistantEnabled,
	MAX_CONCURRENT_STREAMS_PER_USER,
	TURN_TIMEOUT_MS,
} from "../assistant/config.js";
import {
	archiveConversation,
	ConversationAccessError,
	createConversation,
	deriveTitle,
	getConversation,
	listConversations,
	loadMessages,
	renameConversation,
} from "../assistant/conversations.js";
import { openEventStream } from "../assistant/events.js";
import { runTurn } from "../assistant/loop.js";
import { AssistantNotConfiguredError } from "../assistant/openaiClient.js";

const router = Router();

// ── Shared helpers ──────────────────────────────────────────────────────────

/**
 * Build the agent context for this request.
 *
 * `buildAgentContext` is what applies the permission ceiling, so every route
 * here goes through it rather than reading `req.user.permissions` directly.
 */
async function agentContextFrom(req: Request): Promise<AgentContext> {
	return buildAgentContext(
		{
			uid: req.user!.uid,
			role: req.user!.role,
			organization_id: req.user!.organization_id,
			permissions: req.user!.permissions,
		},
		"assistant",
		{ ipAddress: req.ip, userAgent: req.headers["user-agent"] },
	);
}

/** The org's IANA zone, so the model reasons about "today" in the right one. */
async function orgTimezone(organizationId: string): Promise<string> {
	const db = getScopedDb(organizationId);
	const org = await db.organization.findFirst({
		where: { id: organizationId },
		select: { timezone: true },
	});
	return org?.timezone || "America/Chicago";
}

/**
 * Open streams per user.
 *
 * Not a rate limiter — that is Phase 5 — but each stream drives a paid API in a
 * loop, and a retry loop in a browser tab should not be able to open dozens.
 * In-memory on purpose: it guards a single process against a single runaway
 * client, which is exactly the failure it exists for.
 */
const openStreams = new Map<string, number>();

const acquireStream = (userId: string): boolean => {
	const current = openStreams.get(userId) ?? 0;
	if (current >= MAX_CONCURRENT_STREAMS_PER_USER) return false;
	openStreams.set(userId, current + 1);
	return true;
};

const releaseStream = (userId: string): void => {
	const current = openStreams.get(userId) ?? 0;
	if (current <= 1) openStreams.delete(userId);
	else openStreams.set(userId, current - 1);
};

// ── Status ──────────────────────────────────────────────────────────────────

/**
 * What this user can expect from the assistant.
 *
 * The frontend hides the whole feature when `enabled` is false — an assistant
 * that can only apologise is worse than no assistant.
 */
router.get("/status", async (req, res, next) => {
	try {
		const ctx = await agentContextFrom(req);
		const tools = describeTools({
			permissions: ctx.permissions,
			allowWrites: READ_ONLY_POLICY.allowWrites,
			allowDestructive: READ_ONLY_POLICY.allowDestructive,
		});

		res.json(
			createSuccessResponse({
				enabled: isAssistantEnabled() && tools.length > 0,
				reason: !isAssistantEnabled()
					? assistantUnavailableReason()
					: tools.length === 0
						? "Your permissions do not reach anything the assistant can look up."
						: null,
				model: isAssistantEnabled() ? ASSISTANT_MODEL : null,
				readOnly: !READ_ONLY_POLICY.allowWrites,
				toolCount: tools.length,
				tools: tools.map((t) => ({ name: t.name, title: t.title })),
			}),
		);
	} catch (err) {
		next(err);
	}
});

// ── Conversations ───────────────────────────────────────────────────────────

router.get("/conversations", async (req, res, next) => {
	try {
		const ctx = await agentContextFrom(req);
		const conversations = await listConversations(ctx);
		res.json(createSuccessResponse(conversations, { count: conversations.length }));
	} catch (err) {
		next(err);
	}
});

router.post("/conversations", async (req, res, next) => {
	try {
		const ctx = await agentContextFrom(req);
		const conversation = await createConversation(ctx);
		res.status(201).json(createSuccessResponse(conversation));
	} catch (err) {
		next(err);
	}
});

router.get("/conversations/:id/messages", async (req, res, next) => {
	try {
		const ctx = await agentContextFrom(req);
		const messages = await loadMessages(ctx, req.params.id as string);
		res.json(createSuccessResponse(messages, { count: messages.length }));
	} catch (err) {
		if (err instanceof ConversationAccessError) {
			return res.status(404).json(createErrorResponse(ErrorCodes.NOT_FOUND, "No such conversation"));
		}
		next(err);
	}
});

const renameSchema = z.object({ title: z.string().min(1).max(120) });

router.patch("/conversations/:id", async (req, res, next) => {
	try {
		const parsed = renameSchema.safeParse(req.body);
		if (!parsed.success) {
			return res
				.status(400)
				.json(createErrorResponse(ErrorCodes.VALIDATION_ERROR, "title must be 1-120 characters", parsed.error.issues));
		}
		const ctx = await agentContextFrom(req);
		const updated = await renameConversation(ctx, req.params.id as string, parsed.data.title);
		res.json(createSuccessResponse(updated));
	} catch (err) {
		if (err instanceof ConversationAccessError) {
			return res.status(404).json(createErrorResponse(ErrorCodes.NOT_FOUND, "No such conversation"));
		}
		next(err);
	}
});

router.delete("/conversations/:id", async (req, res, next) => {
	try {
		const ctx = await agentContextFrom(req);
		await archiveConversation(ctx, req.params.id as string);
		res.json(createSuccessResponse(null));
	} catch (err) {
		if (err instanceof ConversationAccessError) {
			return res.status(404).json(createErrorResponse(ErrorCodes.NOT_FOUND, "No such conversation"));
		}
		next(err);
	}
});

// ── The turn ────────────────────────────────────────────────────────────────

const streamSchema = z.object({
	message: z.string().min(1, "message is required").max(8000),
	conversation_id: z.string().uuid().optional(),
});

/**
 * POST because a turn sends a body, which EventSource cannot do — the client
 * reads the stream with fetch instead. See frontend/src/api/assistant.ts.
 */
router.post("/stream", async (req, res, next) => {
	if (!isAssistantEnabled()) {
		return res
			.status(503)
			.json(createErrorResponse(ErrorCodes.SERVER_ERROR, assistantUnavailableReason() ?? "Assistant unavailable"));
	}

	const parsed = streamSchema.safeParse(req.body);
	if (!parsed.success) {
		return res
			.status(400)
			.json(createErrorResponse(ErrorCodes.VALIDATION_ERROR, "Invalid request", parsed.error.issues));
	}

	let ctx: AgentContext;
	try {
		ctx = await agentContextFrom(req);
	} catch (err) {
		return next(err);
	}

	const tools = describeTools({
		permissions: ctx.permissions,
		allowWrites: READ_ONLY_POLICY.allowWrites,
		allowDestructive: READ_ONLY_POLICY.allowDestructive,
	});
	if (!tools.length) {
		return res
			.status(403)
			.json(
				createErrorResponse(
					ErrorCodes.INVALID_CREDENTIALS,
					"Your permissions do not reach anything the assistant can look up.",
				),
			);
	}

	if (!acquireStream(ctx.userId)) {
		return res
			.status(429)
			.json(
				createErrorResponse(
					ErrorCodes.TOO_MANY_REQUESTS,
					"You already have the maximum number of assistant replies in flight. Wait for one to finish.",
				),
			);
	}

	// Everything past this point owns the response: errors go into the stream,
	// not to the express error handler, which would try to send headers again.
	const sink = openEventStream(res);
	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), TURN_TIMEOUT_MS);
	req.on("close", () => controller.abort());

	try {
		let conversationId = parsed.data.conversation_id;
		let title: string | null = null;

		if (conversationId) {
			const existing = await getConversation(ctx, conversationId);
			title = existing.title;
		} else {
			const created = await createConversation(ctx, deriveTitle(parsed.data.message));
			conversationId = created.id;
			title = created.title;
		}

		sink.send({ type: "conversation", id: conversationId, title });

		const timezone = await orgTimezone(ctx.organizationId);

		await runTurn({
			ctx,
			policy: READ_ONLY_POLICY,
			timezone,
			conversationId,
			userMessage: parsed.data.message,
			emit: (event) => sink.send(event),
			signal: controller.signal,
		});
	} catch (err) {
		if (err instanceof ConversationAccessError) {
			sink.send({ type: "error", code: "NOT_FOUND", message: "That conversation no longer exists." });
		} else if (err instanceof AssistantNotConfiguredError) {
			sink.send({ type: "error", code: "NOT_CONFIGURED", message: "The assistant is not configured on this server." });
		} else if (controller.signal.aborted) {
			// Either the client navigated away or the turn ran past its budget.
			// Nothing useful to say to a socket that is probably already gone.
			log.info({ evt: "assistant.turn_aborted", org: ctx.organizationId }, "Assistant turn aborted");
		} else {
			log.error({ err, evt: "assistant.turn_failed", org: ctx.organizationId }, "Assistant turn failed");
			sink.send({
				type: "error",
				code: "SERVER_ERROR",
				message: "Something went wrong reaching the assistant. Try again.",
			});
		}
	} finally {
		clearTimeout(timeout);
		releaseStream(ctx.userId);
		sink.close();
	}
});

export default router;
