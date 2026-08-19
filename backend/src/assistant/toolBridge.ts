/**
 * Adapter between the agent registry and OpenAI's function-calling format.
 *
 * This is the whole reason Phase 1 built a transport-agnostic registry: the
 * assistant does not define tools, it renders the ones that already exist. When
 * Phase 4 adds the MCP server it renders the same list a different way, and
 * neither can drift from the other.
 */

import type OpenAI from "openai";
import { describeTools } from "../agent/registry.js";
import type { AgentContext, AgentPolicy } from "../agent/types.js";

/**
 * The catalog in OpenAI's shape, filtered to what this caller may actually call.
 *
 * `strict` is deliberately not enabled. Strict mode requires every property to
 * be listed in `required` and `additionalProperties: false` throughout, which
 * the Zod-derived schemas do not satisfy — most tool parameters are genuinely
 * optional. Loosening the schemas to satisfy strict mode would mean advertising
 * a contract the server does not enforce, which is the wrong trade: the server
 * re-validates every call with Zod regardless, so a malformed call fails with a
 * structured error the model can correct rather than silently succeeding.
 */
export function toolsForOpenAI(ctx: AgentContext, policy: AgentPolicy): OpenAI.Chat.Completions.ChatCompletionTool[] {
	return describeTools({
		permissions: ctx.permissions,
		allowWrites: policy.allowWrites,
		allowDestructive: policy.allowDestructive,
	}).map((tool) => ({
		type: "function" as const,
		function: {
			name: tool.name,
			description: tool.description,
			parameters: tool.inputSchema as Record<string, unknown>,
		},
	}));
}

/**
 * Parse the arguments string a model streamed.
 *
 * Models occasionally emit malformed JSON, especially when a turn is truncated.
 * Returning a marker rather than throwing lets the caller feed the parse failure
 * back as a tool result, which the model can retry — throwing would end the turn
 * over a recoverable mistake.
 */
export function parseToolArguments(raw: string): { ok: true; value: unknown } | { ok: false; message: string } {
	const trimmed = raw.trim();
	if (!trimmed) return { ok: true, value: {} };
	try {
		return { ok: true, value: JSON.parse(trimmed) };
	} catch (err) {
		return { ok: false, message: `Arguments were not valid JSON: ${(err as Error).message}` };
	}
}

/**
 * A one-line, human-readable account of what a call did, for the tool card in
 * the UI. The model gets the full result; a dispatcher gets a sentence.
 */
export function summariseToolResult(toolName: string, input: unknown, data: unknown): string {
	const record = (data ?? {}) as Record<string, unknown>;
	const args = (input ?? {}) as Record<string, unknown>;

	if (Array.isArray(record.hits)) {
		return `Searched for “${String(args.query ?? "")}” — ${record.hits.length} match${record.hits.length === 1 ? "" : "es"}`;
	}
	if (typeof record.returned === "number" && typeof record.total === "number") {
		return `Listed ${record.returned} of ${record.total} ${String(args.type ?? "record")}${record.total === 1 ? "" : "s"}`;
	}
	if (typeof record.total_visits === "number") {
		const unassigned = Array.isArray(record.unassigned) ? record.unassigned.length : 0;
		return `Read the schedule — ${record.total_visits} visit${record.total_visits === 1 ? "" : "s"}, ${unassigned} unassigned`;
	}
	if (Array.isArray(record.technicians)) {
		return `Checked availability for ${record.technicians.length} technician${record.technicians.length === 1 ? "" : "s"}`;
	}
	if (Array.isArray(record.items)) {
		return `Checked stock — ${record.items.length} item${record.items.length === 1 ? "" : "s"}`;
	}
	if (typeof record.report === "string") {
		return `Ran the ${record.report} report`;
	}
	if (Array.isArray(record.entries)) {
		return `Read ${record.entries.length} history entr${record.entries.length === 1 ? "y" : "ies"}`;
	}
	if (record.found === false) {
		return `Looked up a ${String(args.type ?? "record")} — not found`;
	}
	if (typeof record.type === "string") {
		const label = record.job_number ?? record.quote_number ?? record.invoice_number ?? record.name ?? record.title;
		return label ? `Opened ${record.type} ${String(label)}` : `Opened a ${record.type}`;
	}
	return `Ran ${toolName}`;
}
