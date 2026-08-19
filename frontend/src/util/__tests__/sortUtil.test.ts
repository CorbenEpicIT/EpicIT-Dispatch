import { describe, expect, it } from "vitest";
import {
	PRIORITY_SEVERITY,
	compareByOrder,
	compareDate,
	compareDateNullsLast,
	comparePriority,
	withDir,
} from "../sortUtil";
import { PriorityValues } from "../../types/common";

type Row = { id: string; d: string | Date | null | undefined };

const ids = (rows: Row[]) => rows.map((r) => r.id);

describe("comparePriority", () => {
	it("ranks Low < Medium < High < Urgent < Emergency", () => {
		const sorted = [...PriorityValues].reverse().sort(comparePriority);
		expect(sorted).toEqual([...PriorityValues]);
	});

	it("ranks unknown/missing priorities below Low", () => {
		expect(comparePriority(null, "Low")).toBeLessThan(0);
		expect(comparePriority("Bogus", "Low")).toBeLessThan(0);
		expect(comparePriority(undefined, null)).toBe(0);
	});

	it("PRIORITY_SEVERITY is PriorityValues from most to least severe", () => {
		expect(PRIORITY_SEVERITY).toEqual([...PriorityValues].reverse());
	});
});

describe("compareByOrder", () => {
	const order = ["Draft", "Sent", "Paid"] as const;

	it("sorts by position in the given list", () => {
		const sorted = ["Paid", "Draft", "Sent"].sort((a, b) => compareByOrder(a, b, order));
		expect(sorted).toEqual(["Draft", "Sent", "Paid"]);
	});

	it("puts values not in the list (and null/undefined) after every known value", () => {
		const sorted = ["Mystery", "Paid", null, "Draft", undefined].sort((a, b) =>
			compareByOrder(a, b, order),
		);
		expect(sorted.slice(0, 2)).toEqual(["Draft", "Paid"]);
		expect(sorted.slice(2)).toEqual(expect.arrayContaining(["Mystery", null, undefined]));
		expect(compareByOrder("Mystery", null, order)).toBe(0);
	});
});

describe("compareDate", () => {
	const rows: Row[] = [
		{ id: "A", d: "2026-08-01" },
		{ id: "noDate1", d: null },
		{ id: "B", d: "2026-08-15" },
		{ id: "noDate2", d: undefined },
		{ id: "C", d: "2026-07-01" },
		{ id: "invalid", d: "not-a-date" },
	];

	it("sorts ascending with missing/invalid dates last", () => {
		const sorted = [...rows].sort((a, b) => compareDate(a.d, b.d));
		expect(ids(sorted).slice(0, 3)).toEqual(["C", "A", "B"]);
		expect(ids(sorted).slice(3)).toEqual(expect.arrayContaining(["noDate1", "noDate2", "invalid"]));
	});

	it("treats two missing dates as equal (no NaN)", () => {
		expect(compareDate(null, undefined)).toBe(0);
		expect(Number.isNaN(compareDate(null, "garbage"))).toBe(false);
	});

	it("accepts Date objects", () => {
		expect(compareDate(new Date("2026-01-02"), new Date("2026-01-01"))).toBeGreaterThan(0);
	});
});

describe("compareDateNullsLast (R7)", () => {
	const rows: Row[] = [
		{ id: "A", d: "2026-08-01" },
		{ id: "noDate1", d: null },
		{ id: "B", d: "2026-08-15" },
		{ id: "noDate2", d: undefined },
		{ id: "C", d: "2026-07-01" },
	];

	it("asc: oldest first, missing dates last", () => {
		const cmp = compareDateNullsLast("asc");
		expect(ids([...rows].sort((a, b) => cmp(a.d, b.d)))).toEqual([
			"C",
			"A",
			"B",
			"noDate1",
			"noDate2",
		]);
	});

	it("desc: newest first, missing dates STILL last", () => {
		const cmp = compareDateNullsLast("desc");
		expect(ids([...rows].sort((a, b) => cmp(a.d, b.d)))).toEqual([
			"B",
			"A",
			"C",
			"noDate1",
			"noDate2",
		]);
	});

	it("is stable among missing dates in both directions (input order preserved)", () => {
		const nulls: Row[] = [
			{ id: "n1", d: null },
			{ id: "n2", d: null },
			{ id: "X", d: "2026-01-01" },
			{ id: "n3", d: null },
		];
		expect(ids([...nulls].sort((a, b) => compareDateNullsLast("asc")(a.d, b.d)))).toEqual([
			"X",
			"n1",
			"n2",
			"n3",
		]);
		expect(ids([...nulls].sort((a, b) => compareDateNullsLast("desc")(a.d, b.d)))).toEqual([
			"X",
			"n1",
			"n2",
			"n3",
		]);
	});

	it("documents why withDir(compareDate, 'desc') is not used for dates: it floats nulls to the top", () => {
		const sorted = [...rows].sort(withDir((a, b) => compareDate(a.d, b.d), "desc"));
		expect(ids(sorted).slice(0, 2)).toEqual(expect.arrayContaining(["noDate1", "noDate2"]));
	});
});

describe("withDir", () => {
	const cmp = (a: number, b: number) => a - b;

	it("returns the comparator unchanged for asc", () => {
		expect(withDir(cmp, "asc")).toBe(cmp);
		expect([3, 1, 2].sort(withDir(cmp, "asc"))).toEqual([1, 2, 3]);
	});

	it("negates the comparator for desc", () => {
		expect([3, 1, 2].sort(withDir(cmp, "desc"))).toEqual([3, 2, 1]);
	});

	it("keeps equal elements in input order (stable) in both directions", () => {
		const rows = [
			{ id: "a", v: 1 },
			{ id: "b", v: 1 },
			{ id: "c", v: 0 },
		];
		const byV = (a: { v: number }, b: { v: number }) => a.v - b.v;
		expect([...rows].sort(withDir(byV, "asc")).map((r) => r.id)).toEqual(["c", "a", "b"]);
		expect([...rows].sort(withDir(byV, "desc")).map((r) => r.id)).toEqual(["a", "b", "c"]);
	});
});
