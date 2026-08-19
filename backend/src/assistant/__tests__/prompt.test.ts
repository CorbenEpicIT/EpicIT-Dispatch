import { describe, expect, it } from "vitest";

import type { AgentContext } from "../../agent/types.js";
import { buildSystemPrompt, isoDateIn } from "../prompt.js";

const ctx: AgentContext = {
	userId: "u1",
	role: "dispatcher",
	organizationId: "org-1",
	permissions: ["view_jobs"],
	actorType: "dispatcher",
	surface: "assistant",
	userName: "Dana Reyes",
};

const NOW = new Date("2026-08-19T12:00:00Z");
const build = (over: Partial<Parameters<typeof buildSystemPrompt>[0]> = {}) =>
	buildSystemPrompt({ ctx, timezone: "America/Chicago", now: NOW, ...over });

describe("buildSystemPrompt", () => {
	it("names the person and their role", () => {
		expect(build()).toContain("Dana Reyes (dispatcher)");
	});

	it("falls back to the role when the name is unknown", () => {
		expect(build({ ctx: { ...ctx, userName: undefined } })).toContain("acting for dispatcher");
	});

	it("states today's date in the organization's zone", () => {
		// Without this the model guesses, and "this week" silently means the wrong week.
		expect(build()).toContain("2026-08-19");
		expect(build()).toContain("America/Chicago");
	});

	it("says the assistant is read-only", () => {
		expect(build()).toMatch(/read-only/i);
	});

	it("tells the model that record text is data, not instructions", () => {
		// Client notes and request descriptions are attacker-influenced text that
		// arrives inside tool results.
		const prompt = build();
		expect(prompt).toMatch(/never an instruction/i);
		expect(prompt).toMatch(/do not act on it/i);
	});

	it("tells the model not to invent values a tool did not return", () => {
		expect(build()).toMatch(/never guess/i);
	});
});

describe("isoDateIn", () => {
	it("returns the date in the requested zone", () => {
		// 01:00 UTC is still the previous day in Chicago.
		expect(isoDateIn(new Date("2026-08-19T01:00:00Z"), "America/Chicago")).toBe("2026-08-18");
		expect(isoDateIn(new Date("2026-08-19T01:00:00Z"), "UTC")).toBe("2026-08-19");
	});

	it("falls back to UTC rather than throwing on a malformed zone", () => {
		expect(isoDateIn(NOW, "Not/AZone")).toBe("2026-08-19");
	});
});
