/**
 * Assistant configuration.
 *
 * The provider is OpenAI, reached through the Chat Completions API rather than
 * the Responses API. Two reasons: Chat Completions is supported by every OpenAI
 * model and by the OpenAI-compatible endpoints people actually run (Azure,
 * self-hosted gateways), and its streaming shape is stable, so the loop in
 * `loop.ts` does not have to track a newer event vocabulary.
 *
 * The model is an environment variable with no clever default-picking: naming a
 * model in code that the account cannot access fails at the worst moment, in
 * front of a user mid-sentence. Set OPENAI_MODEL deliberately.
 */

export const ASSISTANT_MODEL = process.env.OPENAI_MODEL || "gpt-5";

/** Hard ceiling on model→tool→model round trips inside one user turn. */
export const MAX_TOOL_ITERATIONS = Number(process.env.ASSISTANT_MAX_ITERATIONS) || 6;

/** Turns of history replayed to the model. Older turns are dropped from the tail. */
export const HISTORY_WINDOW = Number(process.env.ASSISTANT_HISTORY_WINDOW) || 40;

/** Upper bound on a single completion. */
export const MAX_COMPLETION_TOKENS = Number(process.env.ASSISTANT_MAX_COMPLETION_TOKENS) || 2000;

/**
 * Concurrent streams one user may hold open.
 *
 * Not a full rate limiter — that is Phase 5 — but an open SSE stream drives a
 * paid API in a loop, and a stuck retry loop in a browser tab should not be able
 * to open fifty of them.
 */
export const MAX_CONCURRENT_STREAMS_PER_USER = Number(process.env.ASSISTANT_MAX_CONCURRENT_STREAMS) || 3;

/** Longest a single turn may run before the server gives up on it. */
export const TURN_TIMEOUT_MS = Number(process.env.ASSISTANT_TURN_TIMEOUT_MS) || 120_000;

export const isAssistantEnabled = (): boolean => Boolean(process.env.OPENAI_API_KEY);

/** Why the assistant is unavailable, in words a dispatcher can act on. */
export const assistantUnavailableReason = (): string | null =>
	isAssistantEnabled() ? null : "The assistant is not configured on this server yet.";
