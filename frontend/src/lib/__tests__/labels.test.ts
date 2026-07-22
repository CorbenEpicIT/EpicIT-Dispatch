import { describe, it, expect } from "vitest";
import { LABEL_TEMPLATES, sheetSlots, mmToIn } from "../labels";

const avery5160 = LABEL_TEMPLATES.avery5160; // 3 columns x 10 rows

describe("mmToIn", () => {
	it("converts millimeters to inches", () => {
		expect(mmToIn(25.4)).toBeCloseTo(1, 10);
		expect(mmToIn(0)).toBe(0);
	});
});

describe("sheetSlots — row-major (default)", () => {
	it("returns columns*rows slots for a full sheet", () => {
		const slots = sheetSlots(avery5160);
		expect(slots).toHaveLength(30);
	});

	it("orders slots left-to-right across each row before advancing rows", () => {
		const slots = sheetSlots(avery5160);
		// First row: same top, increasing left
		expect(slots[0].topIn).toBeCloseTo(slots[1].topIn, 10);
		expect(slots[1].leftIn).toBeGreaterThan(slots[0].leftIn);
		expect(slots[2].topIn).toBeCloseTo(slots[0].topIn, 10);
		// 4th slot (index 3) starts the second row
		expect(slots[3].topIn).toBeGreaterThan(slots[0].topIn);
		expect(slots[3].leftIn).toBeCloseTo(slots[0].leftIn, 10);
	});

	it("matches the template's published geometry for the first cell", () => {
		const slots = sheetSlots(avery5160);
		expect(slots[0]).toEqual({ topIn: avery5160.marginTopIn, leftIn: avery5160.marginLeftIn });
	});
});

describe("sheetSlots — column-major", () => {
	it("orders slots top-to-bottom down each column before advancing columns", () => {
		const slots = sheetSlots(avery5160, { fillDirection: "column" });
		expect(slots).toHaveLength(30);
		// First column: same left, increasing top
		expect(slots[0].leftIn).toBeCloseTo(slots[1].leftIn, 10);
		expect(slots[1].topIn).toBeGreaterThan(slots[0].topIn);
		// 11th slot (index 10) starts the second column
		expect(slots[10].leftIn).toBeGreaterThan(slots[0].leftIn);
		expect(slots[10].topIn).toBeCloseTo(slots[0].topIn, 10);
	});
});

describe("sheetSlots — column-lock", () => {
	it("restricts to a single column's rows, 0-based", () => {
		const slots = sheetSlots(avery5160, { lockedColumn: 1 });
		expect(slots).toHaveLength(avery5160.rows);
		const expectedLeft = avery5160.marginLeftIn + 1 * avery5160.colPitchIn;
		for (const slot of slots) {
			expect(slot.leftIn).toBeCloseTo(expectedLeft, 10);
		}
		// Still ordered top-to-bottom
		expect(slots[1].topIn).toBeGreaterThan(slots[0].topIn);
	});

	it("column-lock composes with column-major fill direction (order unaffected, still single column)", () => {
		const slots = sheetSlots(avery5160, { lockedColumn: 0, fillDirection: "column" });
		expect(slots).toHaveLength(avery5160.rows);
		for (const slot of slots) {
			expect(slot.leftIn).toBeCloseTo(avery5160.marginLeftIn, 10);
		}
	});
});

describe("sheetSlots — calibration offset", () => {
	it("shifts every slot by the calibration mm, converted to inches", () => {
		const base = sheetSlots(avery5160);
		const shifted = sheetSlots(avery5160, { calibration: { xMm: 2.54, yMm: 5.08 } });
		expect(shifted).toHaveLength(base.length);
		for (let i = 0; i < base.length; i++) {
			expect(shifted[i].leftIn).toBeCloseTo(base[i].leftIn + 0.1, 10);
			expect(shifted[i].topIn).toBeCloseTo(base[i].topIn + 0.2, 10);
		}
	});

	it("defaults to zero offset when calibration is omitted", () => {
		const base = sheetSlots(avery5160);
		const explicit = sheetSlots(avery5160, { calibration: { xMm: 0, yMm: 0 } });
		expect(explicit).toEqual(base);
	});
});
