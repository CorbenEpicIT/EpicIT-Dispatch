/**
 * Shared tax formatting utilities.
 * Single source of truth — replaces fmtRate / rateToPercent / formatCombinedRate
 * spread across TaxSettingsSection, FinancialSummary, and tax.ts.
 */

/**
 * Format a decimal rate (0–1) as a compact percentage string.
 * Trailing zeros are stripped.
 *
 * @example
 * formatRatePercent(0.085)  // "8.5"
 * formatRatePercent(0.1)    // "10"
 * formatRatePercent(0.0825) // "8.25"
 */
export function formatRatePercent(rate: number): string {
	return (rate * 100).toFixed(2).replace(/\.?0+$/, "");
}

/**
 * Format a decimal rate as a percentage string with a trailing % sign.
 *
 * @example
 * formatRatePercentLabel(0.085) // "8.5%"
 */
export function formatRatePercentLabel(rate: number): string {
	return `${formatRatePercent(rate)}%`;
}
