import { describe, it, expect } from "vitest";
import { runwayMeter, bandPct } from "../reorderMeter";
import { PLOT_WINDOW_DAYS, REORDER_BAND_DAYS } from "../reorderChart";

describe("runwayMeter", () => {
	it("fills nothing at zero days", () => {
		expect(runwayMeter(0)).toEqual({ pct: 0, clamped: false });
	});

	it("fills proportionally inside the window", () => {
		expect(runwayMeter(12)).toEqual({ pct: 40, clamped: false });
		expect(runwayMeter(PLOT_WINDOW_DAYS)).toEqual({ pct: 100, clamped: false });
	});

	it("caps past the window and says so, so a full bar isn't read as exactly 30 days", () => {
		expect(runwayMeter(45)).toEqual({ pct: 100, clamped: true });
	});

	it("returns null with nothing to measure — the card drops the meter rather than drawing an empty track", () => {
		expect(runwayMeter(null)).toBeNull();
		expect(runwayMeter(undefined)).toBeNull();
		expect(runwayMeter(Number.NaN)).toBeNull();
	});

	it("floors a negative runway at zero", () => {
		expect(runwayMeter(-5)).toEqual({ pct: 0, clamped: false });
	});
});

describe("bandPct", () => {
	it("places the shared band days on the same track as the fill", () => {
		expect(bandPct(REORDER_BAND_DAYS.critical)).toBeCloseTo((7 / 30) * 100, 10);
		expect(bandPct(REORDER_BAND_DAYS.warning)).toBeCloseTo((21 / 30) * 100, 10);
	});

	it("clamps to the track's ends", () => {
		expect(bandPct(-1)).toBe(0);
		expect(bandPct(90)).toBe(100);
	});
});
