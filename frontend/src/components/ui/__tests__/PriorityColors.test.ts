import { describe, expect, it } from "vitest";
import { PriorityColors, PriorityValues } from "../../../types/common";

// Raw Tailwind palette utilities (text-cyan-400, bg-red-600/20, …) only work on a dark
// surface; the light theme fell to ~1.4–2.1:1 contrast (review R8 / 05-F3).
const RAW_PALETTE = /\b(?:bg|text|border)-(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\d{2,3}\b/;

describe("PriorityColors (R8)", () => {
	it("uses theme tokens only — no raw Tailwind palette classes", () => {
		for (const p of PriorityValues) {
			expect(PriorityColors[p], p).not.toMatch(RAW_PALETTE);
		}
	});

	it("every priority defines a bg, text and border class from the theme", () => {
		for (const p of PriorityValues) {
			const cls = PriorityColors[p];
			expect(cls, p).toMatch(/\bbg-(?:info|primary|orange|error|warning|success|neutral)\b|\bbg-[a-z-]+\/\d+/);
			expect(cls, p).toMatch(/\btext-[a-z-]*text\b/);
			expect(cls, p).toMatch(/\bborder-[a-z-]+\/\d+/);
		}
	});

	it("Emergency is the bold, stronger error variant", () => {
		expect(PriorityColors.Emergency).toContain("font-bold");
		expect(PriorityColors.Emergency).toMatch(/\berror\b|error\//);
		expect(PriorityColors.Emergency).not.toBe(PriorityColors.Urgent);
	});
});
