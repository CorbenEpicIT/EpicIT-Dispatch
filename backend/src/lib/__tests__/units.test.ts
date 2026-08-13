import { describe, test, expect } from "vitest";
import {
	UNIT_ALIASES,
	UNIT_CODES,
	UNIT_DISPLAY,
	UNIT_REC20,
	normalizeUnitCode,
	unitDisplay,
	unitWord,
} from "../units";

// Container codes are Rec 21 package types, not Rec 20 units of measure — see
// the units.ts header for the case-by-case verification (box/case/pack/…
// explicitly punt to Rec 21 in the Rec 20 table itself; pair/set/kit/stick
// have genuine standalone Rec 20 codes but are left null anyway for a single
// uninterrupted rule). Kept as a literal here, matching EXPECTED_CODES, so a
// container added without updating both lists fails loudly.
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
];

// The code list, restated as a literal. This is the drift tripwire: the twin
// catalog in frontend/src/lib/units.ts asserts the SAME literal in its own test,
// so adding a unit to one package without the other fails here rather than
// shipping a value the other side can't render or validate.
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

describe("unit catalog", () => {
	test("code list matches the cross-package snapshot", () => {
		expect([...UNIT_CODES]).toEqual(EXPECTED_CODES);
	});

	// A spelling claimed twice resolves to whichever code the build loop reached
	// last — silent, order-dependent misrouting. Fail the build instead.
	test("no spelling is claimed by two codes", () => {
		const owner = new Map<string, string>();
		const collisions: string[] = [];

		for (const code of UNIT_CODES) {
			for (const spelling of [code, ...UNIT_ALIASES[code]]) {
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
		const selfReferential = UNIT_CODES.filter((code) =>
			(UNIT_ALIASES[code] as readonly string[]).includes(code),
		);
		expect(selfReferential).toEqual([]);
	});

	test("aliases are stored pre-normalized (trimmed and lowercased)", () => {
		const malformed: string[] = [];
		for (const code of UNIT_CODES) {
			for (const alias of UNIT_ALIASES[code]) {
				if (alias !== alias.trim().toLowerCase()) malformed.push(`${code}: "${alias}"`);
			}
		}
		expect(malformed).toEqual([]);
	});

	test("every code has an alias entry", () => {
		for (const code of UNIT_CODES) {
			expect(UNIT_ALIASES[code]).toBeDefined();
		}
	});
});

describe("UNIT_REC20", () => {
	// A new code can't silently omit the key — `in` yields undefined from a
	// missing property, which this catches but a bare truthy check wouldn't.
	test("every code has the rec20 key present", () => {
		for (const code of UNIT_CODES) {
			expect(Object.prototype.hasOwnProperty.call(UNIT_REC20, code)).toBe(true);
		}
	});

	test("non-null values are unique", () => {
		const seen = new Map<string, string>();
		const duplicates: string[] = [];
		for (const code of UNIT_CODES) {
			const value = UNIT_REC20[code];
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
			const value = UNIT_REC20[code];
			if (value !== null) expect(placeholders).not.toContain(value);
		}
	});

	test("every container code is null — Rec 21 package types, not Rec 20 units", () => {
		for (const code of CONTAINER_CODES) {
			expect(UNIT_REC20[code as (typeof UNIT_CODES)[number]]).toBeNull();
		}
	});

	test("each maps to EA, not the newer EN 16931/Peppol default H87", () => {
		expect(UNIT_REC20.each).toBe("EA");
	});
});

// The report layer renders these strings server-side, so a code added to the
// catalog without display metadata would export a blank Unit column rather than
// fail a compile — Record<UnitCode, …> catches a missing key, this catches an
// empty one, and the frontend twin asserts the same words on its side.
describe("UNIT_DISPLAY", () => {
	test("covers exactly the catalog, with no blanks", () => {
		expect(Object.keys(UNIT_DISPLAY).sort()).toEqual([...UNIT_CODES].sort());
		for (const code of UNIT_CODES) {
			const d = UNIT_DISPLAY[code];
			expect(d.label.length).toBeGreaterThan(0);
			expect(d.singular.length).toBeGreaterThan(0);
			expect(d.plural.length).toBeGreaterThan(0);
		}
	});

	test("unrecognized and empty values degrade to each, never to a blank", () => {
		expect(unitDisplay("widgets").label).toBe("Each");
		expect(unitDisplay(null).label).toBe("Each");
	});

	test("the word agrees with the quantity — 1 singular, everything else plural", () => {
		expect(unitWord("box", 1)).toBe("box");
		expect(unitWord("box", 0)).toBe("boxes");
		expect(unitWord("box", 0.5)).toBe("boxes");
		// No qty at all is an axis label, which describes a series: plural.
		expect(unitWord("box")).toBe("boxes");
	});
});

describe("normalizeUnitCode", () => {
	test("every code normalizes to itself", () => {
		for (const code of UNIT_CODES) {
			expect(normalizeUnitCode(code)).toBe(code);
		}
	});

	test("every alias normalizes to its code", () => {
		for (const code of UNIT_CODES) {
			for (const alias of UNIT_ALIASES[code]) {
				expect(normalizeUnitCode(alias)).toBe(code);
			}
		}
	});

	test("is case- and whitespace-insensitive", () => {
		expect(normalizeUnitCode("EACH")).toBe("each");
		expect(normalizeUnitCode("Each")).toBe("each");
		expect(normalizeUnitCode("  ft  ")).toBe("ft");
		expect(normalizeUnitCode("\tLBS\n")).toBe("lb");
	});

	test("maps the spellings dispatchers actually type", () => {
		expect(normalizeUnitCode("ea")).toBe("each");
		expect(normalizeUnitCode("pcs")).toBe("each");
		expect(normalizeUnitCode("units")).toBe("each");
		expect(normalizeUnitCode("feet")).toBe("ft");
		expect(normalizeUnitCode("lbs")).toBe("lb");
		expect(normalizeUnitCode("gallons")).toBe("gal");
		expect(normalizeUnitCode("boxes")).toBe("box");
		expect(normalizeUnitCode("cyl")).toBe("cylinder");
	});

	// "weight ounce" and "fluid ounce" are different units that share a word.
	test("keeps ounces and fluid ounces apart", () => {
		expect(normalizeUnitCode("ounces")).toBe("oz");
		expect(normalizeUnitCode("fluid ounces")).toBe("floz");
		expect(normalizeUnitCode("fl oz")).toBe("floz");
	});

	test("returns null rather than guessing", () => {
		expect(normalizeUnitCode("widgets")).toBeNull();
		expect(normalizeUnitCode("")).toBeNull();
		expect(normalizeUnitCode("   ")).toBeNull();
		expect(normalizeUnitCode(null)).toBeNull();
		expect(normalizeUnitCode(undefined)).toBeNull();
		expect(normalizeUnitCode(14)).toBeNull();
		expect(normalizeUnitCode({})).toBeNull();
	});

	// The units the seed already ships must survive normalization untouched,
	// or `npx tsx prisma/seed.ts` would write values the API then rejects.
	test("accepts every unit the seed uses", () => {
		for (const seeded of ["each", "ft", "cylinder"]) {
			expect(normalizeUnitCode(seeded)).toBe(seeded);
		}
	});
});
