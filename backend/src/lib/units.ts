// Canonical units of measure for inventory_item.unit.
//
// Twin file: frontend/src/lib/units.ts carries the same codes plus display
// metadata; both sides' tests assert against a literal list so drift fails a
// test instead of shipping.
//
// Column stays freetext `String @default("each")` — integrity is enforced by
// the Zod enum at the API boundary (lib/validate/inventory.ts), not the DB, so
// unknown legacy values still read back and adding a unit is a code change,
// not a migration.
//
// NAMING COLLISION: "unit" here means unit of MEASURE, unrelated to a
// serial_unit (one tracked item) — do not import this into tracking code.
//
// gal/qt/floz/pt are US customary only, not imperial — no imperial variants
// in v1; metric orgs use l/ml/tonne instead.
//
// No multi-UOM (base unit + purchase unit + conversion factor) by design: it
// would silently corrupt WAC cost math (e.g. a 25-lb cylinder priced against a
// `lb` base reads 25x wrong with no error). Model the pack as a separate item,
// or note the pack size in the item name instead.
//
// UNIT_REC20 maps codes to UN/CEFACT Rec 20 for future e-invoicing
// (EN 16931/Peppol); unused today. `each` -> EA (literal name match), not the
// newer H87 ("piece"). Containers (box/case/pack/etc.) are Rec 21 package
// types, not Rec 20 units, so they're null uniformly — including pair/set/kit/
// stick, which do have Rec 20 codes, kept null anyway so "every container is
// null" stays one rule instead of several exceptions.

export const DEFAULT_UNIT_CODE = "each";

export const UNIT_CODES = [
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
] as const;

export type UnitCode = (typeof UNIT_CODES)[number];

// Lowercased, trimmed spellings that normalize onto a code. No spelling may
// repeat across the table — a duplicate would silently route to whichever
// code the loop reached last; units.test.ts asserts this.
export const UNIT_ALIASES: Record<UnitCode, readonly string[]> = {
	each: [
		"ea",
		"ea.",
		"pc",
		"pcs",
		"piece",
		"pieces",
		"unit",
		"units",
		"count",
		"ct",
		"qty",
		"item",
		"items",
	],
	ft: ["foot", "feet", "'", "lf", "linear ft", "linear foot", "linear feet"],
	in: ["inch", "inches", '"'],
	yd: ["yard", "yards"],
	m: ["meter", "meters", "metre", "metres", "mtr"],
	cm: ["centimeter", "centimeters"],
	mm: ["millimeter", "millimeters", "millimetre", "millimetres"],
	sqft: ["sq ft", "sq. ft.", "ft2", "ft²", "square feet", "square foot"],
	sqyd: ["sq yd", "sq. yd.", "yd2", "yd²", "square yard", "square yards"],
	sqm: [
		"sq m",
		"sq. m.",
		"m2",
		"m²",
		"square meter",
		"square meters",
		"square metre",
		"square metres",
	],
	lb: ["lbs", "pound", "pounds", "#"],
	oz: ["ounce", "ounces"],
	ton: ["short ton", "tons"],
	kg: ["kilo", "kilos", "kilogram", "kilograms", "kgs"],
	g: ["gram", "grams"],
	tonne: ["metric ton", "metric tons", "tonnes"],
	gal: ["gallon", "gallons"],
	qt: ["quart", "quarts"],
	floz: ["fl oz", "fl. oz.", "fluid ounce", "fluid ounces"],
	pt: ["pint", "pints"],
	cuft: ["cu ft", "cu. ft.", "ft3", "ft³", "cubic feet", "cubic foot"],
	l: ["liter", "liters", "litre", "litres", "ltr"],
	ml: ["milliliter", "milliliters"],
	cbm: [
		"cu m",
		"cu. m.",
		"m3",
		"m³",
		"cubic meter",
		"cubic meters",
		"cubic metre",
		"cubic metres",
	],
	box: ["bx", "boxes", "carton"],
	case: ["cs", "cases"],
	pack: ["pk", "pkg", "package", "packages", "packs"],
	pair: ["pr", "pairs"],
	set: ["sets"],
	roll: ["rl", "rolls"],
	spool: ["spools", "reel"],
	bag: ["bags"],
	bucket: ["pail", "pails", "buckets"],
	tube: ["tubes"],
	cylinder: ["cyl", "cylinders", "tank", "tanks"],
	bundle: ["bdl", "bundles"],
	sheet: ["sht", "sheets"],
	coil: ["coils"],
	can: ["cans"],
	kit: ["kits"],
	drum: ["drums"],
	pallet: ["pallets"],
	tote: ["totes"],
	bottle: ["bottles"],
	stick: ["sticks"],
};

// UN/CEFACT Rec 20 code per unit, or null where it isn't a Rec 20 unit (see
// header). Every non-null value is unique — two units sharing a code would
// misdeclare one of them on an invoice.
export const UNIT_REC20: Record<UnitCode, string | null> = {
	each: "EA",
	ft: "FOT",
	in: "INH",
	yd: "YRD",
	m: "MTR",
	cm: "CMT",
	mm: "MMT",
	sqft: "FTK",
	sqyd: "YDK",
	sqm: "MTK",
	lb: "LBR",
	oz: "ONZ",
	ton: "STN",
	kg: "KGM",
	g: "GRM",
	tonne: "TNE",
	gal: "GLL",
	qt: "QTL",
	floz: "OZA",
	pt: "PTL",
	cuft: "FTQ",
	l: "LTR",
	ml: "MLT",
	cbm: "MTQ",
	box: null,
	case: null,
	pack: null,
	pair: null,
	set: null,
	roll: null,
	spool: null,
	bag: null,
	bucket: null,
	tube: null,
	cylinder: null,
	bundle: null,
	sheet: null,
	coil: null,
	can: null,
	kit: null,
	drum: null,
	pallet: null,
	tote: null,
	bottle: null,
	stick: null,
};

const BY_SPELLING: Map<string, UnitCode> = (() => {
	const map = new Map<string, UnitCode>();
	for (const code of UNIT_CODES) {
		map.set(code, code);
		for (const alias of UNIT_ALIASES[code]) map.set(alias, code);
	}
	return map;
})();

/**
 * Canonical code for a freetext unit, or null when nothing matches.
 *
 * Returns null rather than falling back to "each" — callers decide what an
 * unrecognized value means (reject, coerce-and-warn, log-and-coerce).
 */
export function normalizeUnitCode(raw: unknown): UnitCode | null {
	if (typeof raw !== "string") return null;
	const key = raw.trim().toLowerCase();
	if (!key) return null;
	return BY_SPELLING.get(key) ?? null;
}

// ---------------------------------------------------------------------------
// Display metadata
// ---------------------------------------------------------------------------

// Mirrors the frontend twin's label/singular/plural. Lives here too because
// report exports are built server-side in SQL and need the display string
// directly — the client never sees the raw code to translate.
export interface UnitDisplay {
	/** Catalog name, e.g. "Feet". Used where the unit names itself (a column). */
	label: string;
	/** Rendered after a quantity of exactly 1. */
	singular: string;
	/** Rendered after any other quantity — including 0 and fractions. */
	plural: string;
}

export const UNIT_DISPLAY: Record<UnitCode, UnitDisplay> = {
	each: { label: "Each", singular: "unit", plural: "units" },
	ft: { label: "Feet", singular: "ft", plural: "ft" },
	in: { label: "Inches", singular: "in", plural: "in" },
	yd: { label: "Yards", singular: "yd", plural: "yd" },
	m: { label: "Meters", singular: "m", plural: "m" },
	cm: { label: "Centimeters", singular: "cm", plural: "cm" },
	mm: { label: "Millimeters", singular: "mm", plural: "mm" },
	sqft: { label: "Square Feet", singular: "sq ft", plural: "sq ft" },
	sqyd: { label: "Square Yards", singular: "sq yd", plural: "sq yd" },
	sqm: { label: "Square Meters", singular: "m²", plural: "m²" },
	lb: { label: "Pounds", singular: "lb", plural: "lb" },
	oz: { label: "Ounces", singular: "oz", plural: "oz" },
	ton: { label: "Tons (US)", singular: "tons", plural: "tons" },
	kg: { label: "Kilograms", singular: "kg", plural: "kg" },
	g: { label: "Grams", singular: "g", plural: "g" },
	tonne: { label: "Tonnes", singular: "tonne", plural: "tonne" },
	gal: { label: "US Gallons", singular: "US gal", plural: "US gal" },
	qt: { label: "US Quarts", singular: "US qt", plural: "US qt" },
	floz: { label: "US Fluid Ounces", singular: "US fl oz", plural: "US fl oz" },
	pt: { label: "US Pints", singular: "US pt", plural: "US pt" },
	cuft: { label: "Cubic Feet", singular: "cu ft", plural: "cu ft" },
	l: { label: "Liters", singular: "L", plural: "L" },
	ml: { label: "Milliliters", singular: "mL", plural: "mL" },
	cbm: { label: "Cubic Meters", singular: "m³", plural: "m³" },
	box: { label: "Boxes", singular: "box", plural: "boxes" },
	case: { label: "Cases", singular: "case", plural: "cases" },
	pack: { label: "Packs", singular: "pack", plural: "packs" },
	pair: { label: "Pairs", singular: "pair", plural: "pairs" },
	set: { label: "Sets", singular: "set", plural: "sets" },
	roll: { label: "Rolls", singular: "roll", plural: "rolls" },
	spool: { label: "Spools", singular: "spool", plural: "spools" },
	bag: { label: "Bags", singular: "bag", plural: "bags" },
	bucket: { label: "Buckets", singular: "bucket", plural: "buckets" },
	tube: { label: "Tubes", singular: "tube", plural: "tubes" },
	cylinder: { label: "Cylinders", singular: "cylinder", plural: "cylinders" },
	bundle: { label: "Bundles", singular: "bundle", plural: "bundles" },
	sheet: { label: "Sheets", singular: "sheet", plural: "sheets" },
	coil: { label: "Coils", singular: "coil", plural: "coils" },
	can: { label: "Cans", singular: "can", plural: "cans" },
	kit: { label: "Kits", singular: "kit", plural: "kits" },
	drum: { label: "Drums", singular: "drum", plural: "drums" },
	pallet: { label: "Pallets", singular: "pallet", plural: "pallets" },
	tote: { label: "Totes", singular: "tote", plural: "totes" },
	bottle: { label: "Bottles", singular: "bottle", plural: "bottles" },
	stick: { label: "Sticks", singular: "stick", plural: "sticks" },
};

/**
 * Display metadata for a stored unit value. Never throws: a legacy row holding
 * an unrecognized string degrades to `each`, matching the frontend twin's
 * unitDef() so the same row reads the same on both sides.
 */
export function unitDisplay(code: string | null | undefined): UnitDisplay {
	return UNIT_DISPLAY[normalizeUnitCode(code) ?? DEFAULT_UNIT_CODE];
}

/** The unit word alone, agreeing with `qty` when one is given. */
export function unitWord(code: string | null | undefined, qty?: number): string {
	const def = unitDisplay(code);
	return qty === 1 ? def.singular : def.plural;
}
