import { describe, test, expect } from "vitest";
import {
	DEFAULT_UNIT_CODE,
	UNITS,
	UNIT_CODES,
	UNIT_GROUPS,
	formatQty,
	normalizeUnitCode,
	unitDef,
	unitGroupsForSystem,
	unitLabel,
} from "../units";

// Same literal as backend/src/lib/__tests__/units.test.ts. Adding a unit to one
// package without the other fails here instead of shipping a value the other
// side can't validate or render.
const EXPECTED_CODES = [
	"each",
	"ft",
	"in",
	"yd",
	"m",
	"cm",
	"mm",
	"sqft",
	"sqyd",
	"sqm",
	"lb",
	"oz",
	"ton",
	"kg",
	"g",
	"tonne",
	"gal",
	"qt",
	"floz",
	"pt",
	"cuft",
	"l",
	"ml",
	"cbm",
	"box",
	"case",
	"pack",
	"pair",
	"set",
	"roll",
	"spool",
	"bag",
	"bucket",
	"tube",
	"cylinder",
	"bundle",
	"sheet",
	"coil",
	"can",
	"kit",
	"drum",
	"pallet",
	"tote",
	"bottle",
	"stick",
];

// Container codes are Rec 21 package types, not Rec 20 units of measure — see
// the units.ts header for the case-by-case verification (box/case/pack/…
// explicitly punt to Rec 21 in the Rec 20 table itself; pair/set/kit/stick
// have genuine standalone Rec 20 codes but are left null anyway for a single
// uninterrupted rule).
const CONTAINER_CODES = [
	"box",
	"case",
	"pack",
	"pair",
	"set",
	"roll",
	"spool",
	"bag",
	"bucket",
	"tube",
	"cylinder",
	"bundle",
	"sheet",
	"coil",
	"can",
	"kit",
	"drum",
	"pallet",
	"tote",
	"bottle",
	"stick",
] as const;

describe("unit catalog", () => {
	test("code list matches the cross-package snapshot", () => {
		expect([...UNIT_CODES]).toEqual(EXPECTED_CODES);
	});

	test("every code has a definition keyed to itself", () => {
		for (const code of UNIT_CODES) {
			expect(UNITS[code]).toBeDefined();
			expect(UNITS[code].code).toBe(code);
		}
	});

	test("every definition carries non-empty display words", () => {
		for (const code of UNIT_CODES) {
			const def = UNITS[code];
			expect(def.label.length).toBeGreaterThan(0);
			expect(def.singular.length).toBeGreaterThan(0);
			expect(def.plural.length).toBeGreaterThan(0);
		}
	});

	// A spelling claimed twice resolves to whichever code the build loop reached
	// last — silent, order-dependent misrouting.
	test("no spelling is claimed by two codes", () => {
		const owner = new Map<string, string>();
		const collisions: string[] = [];

		for (const code of UNIT_CODES) {
			for (const spelling of [code, ...UNITS[code].aliases]) {
				const previous = owner.get(spelling);
				if (previous) {
					collisions.push(`"${spelling}" claimed by both ${previous} and ${code}`);
				} else {
					owner.set(spelling, code);
				}
			}
		}

		expect(collisions).toEqual([]);
	});

	test("no code lists itself as an alias", () => {
		const selfReferential = UNIT_CODES.filter((code) => UNITS[code].aliases.includes(code));
		expect(selfReferential).toEqual([]);
	});

	// Only `each` is a count, and it is the only code whose display words differ
	// from the code — that asymmetry is the whole reason this module exists.
	test("each is the sole count unit and reads as unit/units", () => {
		const counts = UNIT_CODES.filter((code) => UNITS[code].kind === "count");
		expect(counts).toEqual(["each"]);
		expect(UNITS.each.singular).toBe("unit");
		expect(UNITS.each.plural).toBe("units");
	});

	test("measurements read identically at any count", () => {
		const measurements = [
			"ft",
			"in",
			"m",
			"cm",
			"sqft",
			"lb",
			"oz",
			"kg",
			"g",
			"gal",
			"qt",
			"floz",
			"l",
			"ml",
		] as const;
		for (const code of measurements) {
			expect(UNITS[code].singular).toBe(UNITS[code].plural);
		}
	});

	test("containers pluralize", () => {
		const containers = UNIT_CODES.filter((code) => UNITS[code].kind === "container");
		expect(containers.length).toBeGreaterThan(0);
		for (const code of containers) {
			expect(UNITS[code].plural).not.toBe(UNITS[code].singular);
		}
	});
});

describe("UNIT_GROUPS", () => {
	test("covers every code exactly once", () => {
		const grouped = UNIT_GROUPS.flatMap((group) => group.codes);
		expect([...grouped].sort()).toEqual([...UNIT_CODES].sort());
		expect(new Set(grouped).size).toBe(UNIT_CODES.length);
	});

	test("has no empty group, so the picker renders no empty optgroup", () => {
		for (const group of UNIT_GROUPS) {
			expect(group.codes.length).toBeGreaterThan(0);
			expect(group.label.length).toBeGreaterThan(0);
		}
	});

	test("leads with Count, the unit most items use", () => {
		expect(UNIT_GROUPS[0].kind).toBe("count");
	});
});

describe("UnitDef.system + unitGroupsForSystem", () => {
	// The plan's tagging is asserted here rather than trusted: a wrong `system`
	// is invisible in every other test, since nothing is added, removed or
	// renamed by it.
	test("every code carries a system", () => {
		for (const code of UNIT_CODES) {
			expect(["imperial", "metric", "neutral"]).toContain(UNITS[code].system);
		}
	});

	test("each and every container are neutral, and only those", () => {
		const neutral = UNIT_CODES.filter((code) => UNITS[code].system === "neutral");
		const expected = UNIT_CODES.filter(
			(code) => code === "each" || UNITS[code].kind === "container",
		);
		expect([...neutral].sort()).toEqual([...expected].sort());
	});

	test("every measure code takes a side", () => {
		for (const code of UNIT_CODES) {
			if (code === "each" || UNITS[code].kind === "container") continue;
			expect(UNITS[code].system).not.toBe("neutral");
		}
	});

	// D2's whole promise: ordering only.
	test.each(["imperial", "metric"] as const)("hides nothing for a %s org", (system) => {
		const groups = unitGroupsForSystem(system);
		expect(groups.map((g) => g.kind)).toEqual(UNIT_GROUPS.map((g) => g.kind));
		for (const [i, group] of groups.entries()) {
			expect([...group.codes].sort()).toEqual([...UNIT_GROUPS[i].codes].sort());
		}
	});

	test("puts the org's own system first inside a mixed group", () => {
		const length = (system: "imperial" | "metric") =>
			unitGroupsForSystem(system).find((g) => g.kind === "length")!.codes;
		expect(length("imperial")).toEqual(["ft", "in", "yd", "m", "cm", "mm"]);
		expect(length("metric")).toEqual(["m", "cm", "mm", "ft", "in", "yd"]);
	});

	// A partition, not a sort: flipping the halves must not reshuffle within
	// them, or "Feet, Inches, Yards" becomes an arbitrary order for metric orgs.
	test("preserves catalog order within each half", () => {
		for (const system of ["imperial", "metric"] as const) {
			for (const [i, group] of unitGroupsForSystem(system).entries()) {
				const catalog = UNIT_GROUPS[i].codes;
				const half = (preferred: boolean) =>
					group.codes.filter((code) => (UNITS[code].system === system) === preferred);
				for (const preferred of [true, false]) {
					const actual = half(preferred);
					const expected = catalog.filter((code) => actual.includes(code));
					expect(actual).toEqual(expected);
				}
			}
		}
	});

	test("all-neutral groups are untouched by either system", () => {
		for (const system of ["imperial", "metric"] as const) {
			for (const [i, group] of unitGroupsForSystem(system).entries()) {
				if (!UNIT_GROUPS[i].codes.every((code) => UNITS[code].system === "neutral")) continue;
				expect(group.codes).toEqual(UNIT_GROUPS[i].codes);
			}
		}
	});

	// The loading state, and the reason UnitSelect can render before settings
	// resolve without a visible reshuffle.
	test("falls back to the catalog order when the system is unknown", () => {
		expect(unitGroupsForSystem(undefined)).toBe(UNIT_GROUPS);
		expect(unitGroupsForSystem("neutral")).toBe(UNIT_GROUPS);
	});

	// The default is system-independent by decision (D2 changes ordering only),
	// so it must stay the first option both orderings offer — otherwise the
	// form's initial value stops matching what the picker shows at the top.
	test("the default unit leads the picker under both systems", () => {
		for (const system of ["imperial", "metric"] as const) {
			expect(unitGroupsForSystem(system)[0].codes[0]).toBe(DEFAULT_UNIT_CODE);
		}
	});
});

describe("UnitDef.rec20", () => {
	// A new code can't silently omit the key.
	test("every code has the rec20 key present", () => {
		for (const code of UNIT_CODES) {
			expect(Object.prototype.hasOwnProperty.call(UNITS[code], "rec20")).toBe(true);
		}
	});

	test("non-null values are unique", () => {
		const seen = new Map<string, string>();
		const duplicates: string[] = [];
		for (const code of UNIT_CODES) {
			const value = UNITS[code].rec20;
			if (value === null) continue;
			const owner = seen.get(value);
			if (owner) {
				duplicates.push(`"${value}" claimed by both ${owner} and ${code}`);
			} else {
				seen.set(value, code);
			}
		}
		expect(duplicates).toEqual([]);
	});

	test("no placeholder values", () => {
		const placeholders = ["", "TODO", "XXX"];
		for (const code of UNIT_CODES) {
			const value = UNITS[code].rec20;
			if (value !== null) expect(placeholders).not.toContain(value);
		}
	});

	test("every container code is null — Rec 21 package types, not Rec 20 units", () => {
		for (const code of CONTAINER_CODES) {
			expect(UNITS[code].rec20).toBeNull();
		}
	});

	test("each maps to EA, not the newer EN 16931/Peppol default H87", () => {
		expect(UNITS.each.rec20).toBe("EA");
	});
});

describe("normalizeUnitCode", () => {
	test("every code and alias round-trips to its code", () => {
		for (const code of UNIT_CODES) {
			expect(normalizeUnitCode(code)).toBe(code);
			for (const alias of UNITS[code].aliases) {
				expect(normalizeUnitCode(alias)).toBe(code);
			}
		}
	});

	test("is case- and whitespace-insensitive", () => {
		expect(normalizeUnitCode("EACH")).toBe("each");
		expect(normalizeUnitCode("  Ft ")).toBe("ft");
		expect(normalizeUnitCode("LBS")).toBe("lb");
	});

	test("returns null rather than guessing", () => {
		expect(normalizeUnitCode("widgets")).toBeNull();
		expect(normalizeUnitCode("")).toBeNull();
		expect(normalizeUnitCode(null)).toBeNull();
		expect(normalizeUnitCode(undefined)).toBeNull();
		expect(normalizeUnitCode(3)).toBeNull();
	});
});

describe("unitDef", () => {
	// The nullable ReorderForecastRow.unit reaches here. The old code
	// interpolated it straight into a template literal, which is how the
	// reorder card could print the string "null".
	test("degrades a missing value to each instead of throwing or leaking it", () => {
		expect(unitDef(null).code).toBe(DEFAULT_UNIT_CODE);
		expect(unitDef(undefined).code).toBe(DEFAULT_UNIT_CODE);
		expect(unitDef("").code).toBe(DEFAULT_UNIT_CODE);
		expect(unitDef("   ").code).toBe(DEFAULT_UNIT_CODE);
	});

	// A pre-catalog freetext unit is a real claim about the quantity. Reading
	// "gallon" as `each` silently re-denominated every such row (review P2-1),
	// so an unknown string now renders as itself.
	test("renders a unit outside the catalog verbatim, flagged legacy", () => {
		const def = unitDef("widgets");
		expect(def.code).toBe("widgets");
		expect(def.label).toBe("widgets");
		expect(def.singular).toBe("widgets");
		expect(def.plural).toBe("widgets");
		expect("legacy" in def && def.legacy).toBe(true);
		expect(unitDef(" Skein ").label).toBe("Skein");
		// Catalog entries and their aliases never carry the flag.
		expect("legacy" in unitDef("ft")).toBe(false);
		expect("legacy" in unitDef("gallon")).toBe(false);
	});

	test("resolves aliases, so an unmigrated row still reads correctly", () => {
		expect(unitDef("EACH").code).toBe("each");
		expect(unitDef("lbs").code).toBe("lb");
		expect(unitDef("feet").code).toBe("ft");
	});

	test("exposes the title-case label the detail page shows", () => {
		expect(unitDef("each").label).toBe("Each");
		expect(unitDef("ft").label).toBe("Feet");
		expect(unitDef("sqft").label).toBe("Square Feet");
	});
});

describe("unitLabel", () => {
	test("agrees with the quantity when one is given", () => {
		expect(unitLabel("each", 1)).toBe("unit");
		expect(unitLabel("each", 2)).toBe("units");
		expect(unitLabel("box", 1)).toBe("box");
		expect(unitLabel("box", 3)).toBe("boxes");
	});

	// An axis describes a series, not a value, so it always takes the plural —
	// this is why the qty parameter is optional rather than defaulted to 1.
	test("defaults to the plural when no quantity is given", () => {
		expect(unitLabel("each")).toBe("units");
		expect(unitLabel("box")).toBe("boxes");
		expect(unitLabel("ft")).toBe("ft");
	});

	test("zero and fractions take the plural", () => {
		expect(unitLabel("each", 0)).toBe("units");
		expect(unitLabel("each", 0.42)).toBe("units");
		expect(unitLabel("box", 1.5)).toBe("boxes");
	});
});

describe("formatQty", () => {
	test("renders the reported defect correctly", () => {
		// Was "14 each" on the item detail Overview tab.
		expect(formatQty(14, "each")).toBe("14 units");
		expect(formatQty(1, "each")).toBe("1 unit");
	});

	test("leaves genuine measurements alone", () => {
		expect(formatQty(14, "ft")).toBe("14 ft");
		expect(formatQty(1, "ft")).toBe("1 ft");
		expect(formatQty(2.5, "lb")).toBe("2.5 lb");
	});

	test("pluralizes containers", () => {
		expect(formatQty(3, "box")).toBe("3 boxes");
		expect(formatQty(1, "box")).toBe("1 box");
		expect(formatQty(2, "cylinder")).toBe("2 cylinders");
	});

	test("handles zero, fractions, and a missing unit", () => {
		expect(formatQty(0, "each")).toBe("0 units");
		expect(formatQty(0.42, "each")).toBe("0.42 units");
		expect(formatQty(9, null)).toBe("9 units");
	});

	test("keeps a legacy unit's own word instead of falling back to units", () => {
		expect(formatQty(9, "widgets")).toBe("9 widgets");
		expect(formatQty(1, "skein")).toBe("1 skein");
		expect(unitLabel("skein")).toBe("skein");
	});
});
