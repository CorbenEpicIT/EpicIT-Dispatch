/**
 * Assistant state for the panel.
 *
 * Conversation metadata is server state and lives in TanStack Query. The active
 * turn is not — it is a stream of deltas that only exists while it is arriving —
 * so it lives in a reducer here and is reconciled against the server when the
 * conversation is next loaded.
 */

import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
	AssistantStreamError,
	getAssistantStatus,
	getConversationMessages,
	listConversations,
	streamAssistantTurn,
} from "../api/assistant";
import type { AssistantEvent, StoredMessage, UiMessage, UiToolCall } from "../types/assistant";

const assistantRoot = ["assistant"] as const;

export const assistantKeys = {
	all: assistantRoot,
	status: [...assistantRoot, "status"] as const,
	conversations: [...assistantRoot, "conversations"] as const,
	messages: (id: string) => [...assistantRoot, "conversation", id, "messages"] as const,
};

export function useAssistantStatus() {
	return useQuery({
		queryKey: assistantKeys.status,
		queryFn: getAssistantStatus,
		// Whether the server has a key configured does not change minute to minute.
		staleTime: 5 * 60 * 1000,
	});
}

export function useAssistantConversations(enabled: boolean) {
	return useQuery({
		queryKey: assistantKeys.conversations,
		queryFn: listConversations,
		enabled,
	});
}

// ── Turn state ──────────────────────────────────────────────────────────────

interface TurnState {
	messages: UiMessage[];
	streaming: boolean;
}

type TurnAction =
	| { kind: "reset"; messages: UiMessage[] }
	| { kind: "user"; content: string }
	| { kind: "start" }
	| { kind: "event"; event: AssistantEvent }
	| { kind: "fail"; message: string };

/** Ids for optimistic rows, distinct from server ids so reconciliation is obvious. */
let localId = 0;
const nextLocalId = () => `local-${++localId}`;

/** Apply a change to the in-flight assistant message, which is always the last one. */
function updateStreaming(messages: UiMessage[], change: (m: Extract<UiMessage, { role: "assistant" }>) => void) {
	const last = messages[messages.length - 1];
	if (!last || last.role !== "assistant" || !last.streaming) return messages;
	const clone = { ...last, toolCalls: [...last.toolCalls] };
	change(clone);
	return [...messages.slice(0, -1), clone];
}

function turnReducer(state: TurnState, action: TurnAction): TurnState {
	switch (action.kind) {
		case "reset":
			return { messages: action.messages, streaming: false };

		case "user":
			return {
				...state,
				messages: [...state.messages, { id: nextLocalId(), role: "user", content: action.content }],
			};

		case "start":
			return {
				streaming: true,
				messages: [
					...state.messages,
					{ id: nextLocalId(), role: "assistant", content: "", toolCalls: [], streaming: true },
				],
			};

		case "fail": {
			const settled = state.messages
				// Drop an empty placeholder rather than leaving a blank bubble above the error.
				.filter((m) => !(m.role === "assistant" && m.streaming && !m.content && !m.toolCalls.length))
				.map((m): UiMessage => (m.role === "assistant" ? { ...m, streaming: false } : m));
			return {
				streaming: false,
				messages: [...settled, { id: nextLocalId(), role: "error", content: action.message }],
			};
		}

		case "event": {
			const event = action.event;
			switch (event.type) {
				case "text_delta":
					return {
						...state,
						messages: updateStreaming(state.messages, (m) => {
							m.content += event.text;
						}),
					};

				case "tool_call":
					return {
						...state,
						messages: updateStreaming(state.messages, (m) => {
							m.toolCalls.push({
								id: event.id,
								name: event.name,
								input: event.input,
								state: "running",
							} satisfies UiToolCall);
						}),
					};

				case "tool_result":
					return {
						...state,
						messages: updateStreaming(state.messages, (m) => {
							m.toolCalls = m.toolCalls.map((call) =>
								call.id === event.id
									? {
											...call,
											state: event.ok ? "ok" : "error",
											summary: event.summary,
											errorMessage: event.errorMessage,
											durationMs: event.durationMs,
										}
									: call,
							);
						}),
					};

				case "error":
					return turnReducer(state, { kind: "fail", message: event.message });

				case "done":
					return {
						streaming: false,
						messages: state.messages.map((m): UiMessage =>
							m.role === "assistant" ? { ...m, streaming: false } : m,
						),
					};

				default:
					return state;
			}
		}

		default:
			return state;
	}
}

/** Server rows → the panel's message shape. */
function fromStored(rows: StoredMessage[]): UiMessage[] {
	return rows.map((row): UiMessage => {
		if (row.role === "user") return { id: row.id, role: "user", content: row.content };
		return {
			id: row.id,
			role: "assistant",
			content: row.content,
			streaming: false,
			toolCalls: row.tool_calls.map((call) => ({
				id: call.provider_call_id,
				name: call.tool_name,
				input: call.input,
				state: call.status === "ok" ? "ok" : "error",
				durationMs: call.duration_ms ?? undefined,
			})),
		};
	});
}

export function useAssistantChat() {
	const queryClient = useQueryClient();
	const [conversationId, setConversationId] = useState<string | null>(null);
	const [state, dispatch] = useReducer(turnReducer, { messages: [], streaming: false });
	const abortRef = useRef<AbortController | null>(null);

	// Abort any in-flight turn when the panel unmounts, so a closed drawer stops
	// costing tokens.
	useEffect(() => () => abortRef.current?.abort(), []);

	const openConversation = useCallback(
		async (id: string | null) => {
			abortRef.current?.abort();
			setConversationId(id);
			if (!id) {
				dispatch({ kind: "reset", messages: [] });
				return;
			}
			const rows = await queryClient.fetchQuery({
				queryKey: assistantKeys.messages(id),
				queryFn: () => getConversationMessages(id),
			});
			dispatch({ kind: "reset", messages: fromStored(rows) });
		},
		[queryClient],
	);

	const send = useCallback(
		async (message: string) => {
			const text = message.trim();
			if (!text || state.streaming) return;

			const controller = new AbortController();
			abortRef.current = controller;

			dispatch({ kind: "user", content: text });
			dispatch({ kind: "start" });

			let activeId = conversationId;

			try {
				await streamAssistantTurn({
					message: text,
					conversationId: activeId ?? undefined,
					signal: controller.signal,
					onEvent: (event) => {
						if (event.type === "conversation") {
							activeId = event.id;
							setConversationId(event.id);
							return;
						}
						if (event.type === "invalidate") {
							// Inert while the assistant is read-only; wired so Phase 3's
							// write tools refresh the pages they changed.
							for (const key of event.keys) {
								queryClient.invalidateQueries({ queryKey: [key.split(":")[0]] });
							}
							return;
						}
						dispatch({ kind: "event", event });
					},
				});
			} catch (err) {
				if (controller.signal.aborted) return;
				dispatch({
					kind: "fail",
					message:
						err instanceof AssistantStreamError
							? err.message
							: "Could not reach the assistant. Check your connection and try again.",
				});
			} finally {
				if (abortRef.current === controller) abortRef.current = null;
				queryClient.invalidateQueries({ queryKey: assistantKeys.conversations });
				if (activeId) queryClient.invalidateQueries({ queryKey: assistantKeys.messages(activeId) });
			}
		},
		[conversationId, queryClient, state.streaming],
	);

	const stop = useCallback(() => {
		abortRef.current?.abort();
		dispatch({ kind: "event", event: { type: "done", messageId: null, usage: null } });
	}, []);

	const startNew = useCallback(() => {
		abortRef.current?.abort();
		setConversationId(null);
		dispatch({ kind: "reset", messages: [] });
	}, []);

	return useMemo(
		() => ({
			conversationId,
			messages: state.messages,
			streaming: state.streaming,
			send,
			stop,
			startNew,
			openConversation,
		}),
		[conversationId, state.messages, state.streaming, send, stop, startNew, openConversation],
	);
}
