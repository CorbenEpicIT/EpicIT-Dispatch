/**
 * The SSE protocol between the assistant loop and the browser.
 *
 * Server-sent events rather than the existing Socket.io connection: the socket's
 * rooms are org- and technician-scoped, so per-conversation streams would need
 * new room management for no benefit, and a turn maps naturally onto one
 * request. The cost is that the axios refresh interceptor does not cover a raw
 * fetch — the client handles that itself (see frontend/src/api/assistant.ts).
 */

import type { Response } from "express";

export type AssistantEvent =
	/** Sent first. Tells a client that started without one which conversation it is in. */
	| { type: "conversation"; id: string; title: string | null }
	/** Incremental assistant prose. */
	| { type: "text_delta"; text: string }
	/** A tool is about to run. Rendered as a card so the work is visible as it happens. */
	| { type: "tool_call"; id: string; name: string; input: unknown }
	/** That tool finished. `summary` is for the person, `ok` drives the card's state. */
	| {
			type: "tool_result";
			id: string;
			ok: boolean;
			summary: string;
			errorCode?: string;
			errorMessage?: string;
			durationMs: number;
	  }
	/**
	 * Cache keys the client should invalidate. Inert while the assistant is
	 * read-only — no read tool declares `invalidates` — and wired now so Phase 3
	 * does not have to touch the protocol.
	 */
	| { type: "invalidate"; keys: string[] }
	/** Terminal success. */
	| { type: "done"; messageId: string | null; usage: { input: number; output: number } | null }
	/** Terminal failure. The client renders this in the thread, not as a toast. */
	| { type: "error"; message: string; code?: string };

export interface EventSink {
	send(event: AssistantEvent): void;
	close(): void;
}

/**
 * Open an SSE response and return a sink for it.
 *
 * `X-Accel-Buffering: no` matters behind nginx, which otherwise buffers the
 * whole response and delivers the entire turn at once — technically correct and
 * useless, since the point of streaming is that text appears while it is
 * generated.
 */
export function openEventStream(res: Response, heartbeatMs = 15_000): EventSink {
	res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
	res.setHeader("Cache-Control", "no-cache, no-transform");
	res.setHeader("Connection", "keep-alive");
	res.setHeader("X-Accel-Buffering", "no");
	res.flushHeaders?.();

	let closed = false;

	// Comment frames keep intermediaries from reaping a connection that is quiet
	// while a slow tool runs.
	const heartbeat = setInterval(() => {
		if (!closed) res.write(": ping\n\n");
	}, heartbeatMs);

	const stop = () => {
		if (closed) return;
		closed = true;
		clearInterval(heartbeat);
	};

	res.on("close", stop);

	return {
		send(event) {
			if (closed) return;
			res.write(`data: ${JSON.stringify(event)}\n\n`);
		},
		close() {
			stop();
			if (!res.writableEnded) res.end();
		},
	};
}
