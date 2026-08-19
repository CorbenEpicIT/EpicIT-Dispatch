/**
 * Assistant API client.
 *
 * Conversation CRUD goes through the shared axios instance like everything else.
 * The turn itself does not: axios cannot expose a streaming response body in the
 * browser, so `streamAssistantTurn` uses fetch and parses the SSE frames itself.
 *
 * That has one consequence worth stating plainly — the axios response
 * interceptor that transparently refreshes an expired access token does not
 * cover a raw fetch. Rather than reimplementing that logic (and its in-flight
 * request queue) a second time, a 401 here bounces one cheap request through
 * axios, which performs the refresh and leaves a fresh token in localStorage,
 * then retries the stream once.
 */

import { api } from "./axiosClient";
import type { AssistantConversation, AssistantEvent, AssistantStatus, StoredMessage } from "../types/assistant";

const BASE_URL: string = import.meta.env.VITE_BACKEND_URL;

// ── Conversation CRUD ───────────────────────────────────────────────────────

export const getAssistantStatus = async (): Promise<AssistantStatus> => {
	const { data } = await api.get<{ data: AssistantStatus }>("/assistant/status");
	return data.data;
};

export const listConversations = async (): Promise<AssistantConversation[]> => {
	const { data } = await api.get<{ data: AssistantConversation[] }>("/assistant/conversations");
	return data.data;
};

export const getConversationMessages = async (id: string): Promise<StoredMessage[]> => {
	const { data } = await api.get<{ data: StoredMessage[] }>(`/assistant/conversations/${id}/messages`);
	return data.data;
};

export const renameConversation = async (id: string, title: string): Promise<AssistantConversation> => {
	const { data } = await api.patch<{ data: AssistantConversation }>(`/assistant/conversations/${id}`, { title });
	return data.data;
};

export const archiveConversation = async (id: string): Promise<void> => {
	await api.delete(`/assistant/conversations/${id}`);
};

// ── The streaming turn ──────────────────────────────────────────────────────

export class AssistantStreamError extends Error {
	// A plain field rather than a constructor parameter property: the frontend
	// tsconfig sets erasableSyntaxOnly, which rules those out.
	readonly status?: number;

	constructor(message: string, status?: number) {
		super(message);
		this.name = "AssistantStreamError";
		this.status = status;
	}
}

/**
 * Force a token refresh by bouncing a request through axios, whose response
 * interceptor owns the refresh flow and its queue. Returns the fresh token, or
 * null if refreshing failed (in which case axios has already redirected).
 */
async function refreshViaAxios(): Promise<string | null> {
	try {
		await api.get("/assistant/status");
	} catch {
		return null;
	}
	return localStorage.getItem("accessToken");
}

interface StreamOptions {
	message: string;
	conversationId?: string;
	onEvent: (event: AssistantEvent) => void;
	signal: AbortSignal;
}

async function openStream(options: StreamOptions, token: string | null): Promise<Response> {
	return fetch(`${BASE_URL}/assistant/stream`, {
		method: "POST",
		credentials: "include",
		headers: {
			"Content-Type": "application/json",
			Accept: "text/event-stream",
			...(token ? { Authorization: `Bearer ${token}` } : {}),
		},
		body: JSON.stringify({
			message: options.message,
			...(options.conversationId ? { conversation_id: options.conversationId } : {}),
		}),
		signal: options.signal,
	});
}

/** Read an SSE body, dispatching each `data:` frame. Comment frames (heartbeats) are skipped. */
async function consume(response: Response, onEvent: (event: AssistantEvent) => void): Promise<void> {
	const body = response.body;
	if (!body) throw new AssistantStreamError("The server sent no response body");

	const reader = body.getReader();
	const decoder = new TextDecoder();
	let buffer = "";

	for (;;) {
		const { done, value } = await reader.read();
		if (done) break;
		buffer += decoder.decode(value, { stream: true });

		let boundary = buffer.indexOf("\n\n");
		while (boundary !== -1) {
			const frame = buffer.slice(0, boundary);
			buffer = buffer.slice(boundary + 2);

			for (const line of frame.split("\n")) {
				// ": ping" heartbeats and any other comment line fall through here.
				if (!line.startsWith("data:")) continue;
				const payload = line.slice(5).trim();
				if (!payload) continue;
				try {
					onEvent(JSON.parse(payload) as AssistantEvent);
				} catch {
					// A frame we cannot parse is not worth tearing the stream down for.
				}
			}
			boundary = buffer.indexOf("\n\n");
		}
	}
}

/** Read a non-streaming error body, preferring the API's own message. */
async function describeFailure(response: Response): Promise<string> {
	try {
		const body = (await response.json()) as { error?: { message?: string } };
		if (body?.error?.message) return body.error.message;
	} catch {
		// Fall through to the generic message below.
	}
	return response.status === 429
		? "You already have a reply in flight. Wait for it to finish."
		: "The assistant is unavailable right now.";
}

export async function streamAssistantTurn(options: StreamOptions): Promise<void> {
	let response = await openStream(options, localStorage.getItem("accessToken"));

	if (response.status === 401) {
		const fresh = await refreshViaAxios();
		if (!fresh) throw new AssistantStreamError("Your session expired. Sign in again.", 401);
		response = await openStream(options, fresh);
	}

	if (!response.ok) {
		throw new AssistantStreamError(await describeFailure(response), response.status);
	}

	await consume(response, options.onEvent);
}
