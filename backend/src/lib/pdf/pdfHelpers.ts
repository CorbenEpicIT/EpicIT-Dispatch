/**
 * pdfHelpers.ts
 * Shared utilities and types used by both quotePdfTemplate and invoicePdfTemplate.
 */
import type { Decimal } from "@prisma/client/runtime/client";

// ── Shared types ──────────────────────────────────────────────────────────────

export type Numeric = Decimal | number | string | null | undefined;

export interface OrgPdfProps {
	name: string;
	logo_url?: string | null;
	phone?: string | null;
	address?: string | null;
	email?: string | null;
	website?: string | null;
}

// ── Formatting helpers ────────────────────────────────────────────────────────

export const toNum = (v: unknown): number => (v == null ? 0 : Number(v));

export const fmt = (v: unknown): string =>
	`$${toNum(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export const fmtDate = (d: unknown): string => {
	if (!d) return "—";
	return new Date(d as string).toLocaleDateString("en-US", {
		month: "short",
		day: "numeric",
		year: "numeric",
	});
};

/** Format a 0-1 decimal rate as a compact percent string, e.g. 0.085 → "8.5%" */
export const fmtRatePct = (rate: number): string =>
	`${(rate * 100).toFixed(2).replace(/\.?0+$/, "")}%`;
