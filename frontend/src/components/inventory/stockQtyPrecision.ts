/**
 * Client-side mirror of `isStorableStockQty` in `backend/src/lib/validate/shared.ts`
 * — warehouse quantity columns are `numeric(10, 2)`, so forms must agree with that
 * bound before submitting. No minimum enforced here; callers add their own sign
 * check (quantity/threshold >= 0, but an adjust `delta` may be negative).
 */

const STOCK_QTY_SCALE = 2;

/** Largest value `numeric(10, 2)` can hold: 8 integer digits plus 2 decimals. */
const MAX_STOCK_QTY = 99_999_999.99;

/**
 * Decimal places in a number's shortest round-trip representation. String-based,
 * not arithmetic — `Math.round(v * 100) === v * 100` false-positives on `0.07`.
 */
function decimalPlaces(v: number): number {
	const s = String(v);
	if (s.includes("e") || s.includes("E")) return Infinity;
	const dot = s.indexOf(".");
	return dot === -1 ? 0 : s.length - dot - 1;
}

/** True when `v` survives a round trip through a `numeric(10, 2)` column unchanged. */
export function isStorableStockQty(v: number): boolean {
	return Number.isFinite(v) && Math.abs(v) <= MAX_STOCK_QTY && decimalPlaces(v) <= STOCK_QTY_SCALE;
}

/**
 * Rounds a derived value (e.g. `target - current` in AdjustStockModal) to the
 * column's 2-dp scale so float drift like `2.9999999999998` doesn't trip the bound above.
 */
export function roundToStockQtyScale(v: number): number {
	return Math.round(v * 100) / 100;
}
