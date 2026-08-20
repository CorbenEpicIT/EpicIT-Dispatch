import { describe, it, expect, vi } from "vitest";
import { ZodError } from "zod";

vi.mock("../../db.js", () => ({ db: { $extends: () => ({}) } }));

import { parseHistoryLimit, DEFAULT_HISTORY_LIMIT, MAX_HISTORY_LIMIT, INVALID_HISTORY_LIMIT } from "../logsController.js";

describe("parseHistoryLimit (review P2-11)", () => {
	it("defaults when absent", () => {
		expect(parseHistoryLimit(undefined)).toBe(DEFAULT_HISTORY_LIMIT);
		expect(parseHistoryLimit(null)).toBe(DEFAULT_HISTORY_LIMIT);
		expect(parseHistoryLimit("")).toBe(DEFAULT_HISTORY_LIMIT);
	});

	it("coerces valid integers within range", () => {
		expect(parseHistoryLimit("5")).toBe(5);
		expect(parseHistoryLimit(String(MAX_HISTORY_LIMIT))).toBe(MAX_HISTORY_LIMIT);
		expect(parseHistoryLimit(1)).toBe(1);
	});

	it.each(["-1", "0", "1.5", "abc", String(MAX_HISTORY_LIMIT + 1), "[]", "1e3"])(
		"throws a ZodError for %s",
		(raw) => {
			expect(() => parseHistoryLimit(raw)).toThrow(ZodError);
		},
	);

	it("exposes a user-facing message that names the accepted range", () => {
		expect(INVALID_HISTORY_LIMIT).toContain(String(MAX_HISTORY_LIMIT));
	});
});
