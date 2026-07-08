import { useMemo, useState } from "react";
import { Receipt } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import SearchBar from "../../components/ui/SearchBar";
import FilterChips from "../../components/ui/FilterChips";
import PageControls from "../../components/ui/PageControls";
import PageHeader from "../../components/ui/PageHeader";
import ColumnsButton from "../../components/ui/ColumnsButton";
import ExportExcelButton from "../../components/reports/ExportExcelButton";
import AdaptableTable from "../../components/AdaptableTable";
import DateRangeFilter from "../../components/ui/DateRangeFilter";
import { exportReport } from "../../api/reports";
import { datedFilename } from "../../util/download";
import { useMultiSearch } from "../../hooks/useMultiSearch";
import {
	buildColumnAlign,
	buildHeaderLabels,
	useColumnVisibility,
	type ColumnOption,
} from "../../hooks/useColumnVisibility";
import { formatCurrency } from "../../util/util";
import { formatRatePercentLabel } from "../../lib/formatTax";
import { parseDateRangeFromParams, resolveDateRange } from "../../util/dateRangeUtils";
import { useTaxLiabilityReportQuery } from "../../hooks/useReports";

const COLS: ColumnOption[] = [
	{ key: "jurisdiction", label: "Jurisdiction" },
	{ key: "rateName", label: "Rate" },
	{ key: "rate", label: "Rate %" },
	{ key: "taxableBase", label: "Taxable Base" },
	{ key: "taxCollected", label: "Tax Collected" },
	{ key: "invoiceCount", label: "Invoices" },
];

const TEXT_KEYS = ["jurisdiction", "rateName"] as const;

const HEADER_LABELS = buildHeaderLabels(COLS);
const COLUMN_ALIGN = buildColumnAlign(COLS, ["rate", "taxableBase", "taxCollected", "invoiceCount"]);

export default function TaxLiabilityPage() {
	const [searchInput, setSearchInput] = useState("");
	const { terms, addTerm, removeTerm, clearAll, duplicateTerm } = useMultiSearch("search");

	const [searchParams] = useSearchParams();
	const dateRange = parseDateRangeFromParams(searchParams, "period");
	const resolved = resolveDateRange(dateRange);
	const startDate = resolved?.start.toISOString();
	const endDate = resolved?.end.toISOString();

	const { data, isLoading, error } = useTaxLiabilityReportQuery(startDate, endDate);
	const records = useMemo(() => data ?? [], [data]);

	const rows = useMemo(() => {
		const activeTerms = searchInput.trim() ? [...terms, searchInput.trim()] : terms;
		return records.filter((r) =>
			activeTerms.every((term) => {
				const t = term.toLowerCase();
				return TEXT_KEYS.some((key) => String(r[key]).toLowerCase().includes(t));
			}),
		);
	}, [records, searchInput, terms]);

	const totals = useMemo(() => {
		const acc = { taxableBase: 0, taxCollected: 0, invoiceCount: 0 };
		for (const r of rows) {
			acc.taxableBase += r.taxableBase;
			acc.taxCollected += r.taxCollected;
			acc.invoiceCount += r.invoiceCount;
		}
		return acc;
	}, [rows]);

	const { hidden, toggle, reset, columnVisibility, visibleColumns } = useColumnVisibility(
		"tax-liability",
		COLS,
	);

	const displayRows = useMemo(
		() =>
			rows.map((r) => ({
				jurisdiction: r.jurisdiction,
				rateName: r.rateName,
				rate: formatRatePercentLabel(r.rate),
				taxableBase: formatCurrency(r.taxableBase),
				taxCollected: formatCurrency(r.taxCollected),
				invoiceCount: r.invoiceCount,
			})),
		[rows],
	);

	const footerRow = useMemo(
		() => ({
			jurisdiction: "Total",
			taxableBase: formatCurrency(totals.taxableBase),
			taxCollected: formatCurrency(totals.taxCollected),
			invoiceCount: totals.invoiceCount.toLocaleString(),
		}),
		[totals],
	);

	const clearAllFilters = () => {
		setSearchInput("");
		clearAll();
	};

	const hasActiveFilters = terms.length > 0 || dateRange.option !== "all";
	const showEmpty = rows.length === 0 && !isLoading && !error;

	return (
		<div className="text-text-primary">
			<PageHeader title="Tax Liability" />

			<PageControls
				className="mb-4"
				left={
					<SearchBar
						paramKey="search"
						placeholder="Search by jurisdiction or rate..."
						onValueChange={setSearchInput}
						onSubmit={addTerm}
					/>
				}
				right={
					<>
						<DateRangeFilter paramKey="period" />
						<ExportExcelButton
							onExport={() =>
								exportReport({
									filename: datedFilename("tax-liability"),
									sheetName: "Tax Liability",
									columns: visibleColumns,
									rows: displayRows,
								})
							}
							disabled={rows.length === 0}
						/>
						<ColumnsButton columns={COLS} hidden={hidden} onToggle={toggle} onReset={reset} />
					</>
				}
			/>

			<FilterChips
				filters={terms.map((term) => ({
					label: `Search: "${term}"`,
					color: "purple" as const,
					onRemove: () => removeTerm(term),
					highlighted: duplicateTerm === term,
				}))}
				resultCount={rows.length}
				onClearAll={clearAllFilters}
			/>

			<div className="shadow-sm border border-border-subtle p-3 bg-base rounded-lg overflow-x-auto text-left">
				{showEmpty ? (
					<div className="text-center py-16">
						<Receipt size={48} className="mx-auto text-text-faint mb-3" />
						<h3 className="text-text-tertiary text-lg font-medium mb-2">No tax collected</h3>
						<p className="text-text-muted text-sm">
							{hasActiveFilters
								? "Try adjusting your filters"
								: "Tax collected on issued invoices appears here"}
						</p>
					</div>
				) : (
					<AdaptableTable
						data={displayRows}
						loadListener={isLoading}
						errListener={error}
						formatNums={false}
						columnVisibility={columnVisibility}
						headerLabels={HEADER_LABELS}
						columnAlign={COLUMN_ALIGN}
						footerRow={footerRow}
					/>
				)}
			</div>
		</div>
	);
}
