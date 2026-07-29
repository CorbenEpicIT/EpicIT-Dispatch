export interface TaxRate {
	id: string;
	organization_id: string;
	name: string;
	rate: number; // 0-1 decimal
	description: string | null;
	jurisdiction: string | null;
	is_default: boolean;
	is_active: boolean;
	created_at: string;
	updated_at: string;
}

export interface TaxGroupRate {
	id: string;
	tax_rate: TaxRate;
	sort_order: number;
}

export interface TaxGroup {
	id: string;
	organization_id: string;
	name: string;
	description: string | null;
	is_default: boolean;
	is_active: boolean;
	rates: TaxGroupRate[];
	combined_rate: number; // backend-computed: sum of rates[].tax_rate.rate
	created_at: string;
	updated_at: string;
	qb_tax_code_id?: string | null;
}

export interface TaxSnapshotRate {
	id: string;
	name: string;
	rate: number;
	jurisdiction?: string;
}

export interface TaxSnapshotGroup {
	id: string;
	name: string;
	rates: TaxSnapshotRate[];
	taxable_amount_cents: number;
	tax_amount_cents: number;
}

export interface TaxSnapshot {
	version: 1;
	locked_at: string;
	client_exempt: boolean;
	groups: TaxSnapshotGroup[];
	non_taxable_amount_cents: number;
	total_tax_cents: number;
	subtotal_cents: number;
	discount_cents: number;
	total_cents: number;
	effective_rate: number;
}

import { formatRatePercent, formatRatePercentLabel } from "../lib/formatTax";

// Helper: compute display label for a tax group
// e.g. "Standard Rate 8%" or "Labor Only 6%"
export function formatTaxGroupLabel(group: TaxGroup): string {
	if (group.rates.length === 0) return group.name;
	return `${group.name} ${formatRatePercent(group.combined_rate)}%`;
}

// Helper: format combined rate as percentage string
export function formatCombinedRate(rate: number): string {
	return formatRatePercentLabel(rate);
}
