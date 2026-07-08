import { useMemo, useState } from "react";
import { DollarSign } from "lucide-react";
import { useNavigate } from "react-router-dom";
import SearchBar from "../../components/ui/SearchBar";
import FilterChips from "../../components/ui/FilterChips";
import PageControls from "../../components/ui/PageControls";
import PageHeader from "../../components/ui/PageHeader";
import ColumnsButton from "../../components/ui/ColumnsButton";
import ExportExcelButton from "../../components/reports/ExportExcelButton";
import AdaptableTable from "../../components/AdaptableTable";
import AgedReceivablesColumnChart from "../../components/reports/AgedReceivablesColumnChart";
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
import {
	useAgedReceivablesQuery,
	useAgedReceivablesByClientQuery,
} from "../../hooks/useReports";

const COLS: ColumnOption[] = [
	{ key: "clientName", label: "Client" },
	{ key: "bucket0_30", label: "0-30 days" },
	{ key: "bucket31_60", label: "31-60 days" },
	{ key: "bucket61_90", label: "61-90 days" },
	{ key: "bucket90plus", label: "90+ days" },
	{ key: "total", label: "Total" },
];

const AMOUNT_KEYS = ["bucket0_30", "bucket31_60", "bucket61_90", "bucket90plus", "total"] as const;

const HEADER_LABELS = buildHeaderLabels(COLS);
const COLUMN_ALIGN = buildColumnAlign(COLS, AMOUNT_KEYS);

export default function AgedReceivablesPage() {
	const navigate = useNavigate();
	const [searchInput, setSearchInput] = useState("");
	const { terms, addTerm, removeTerm, clearAll, duplicateTerm } = useMultiSearch("search");

	const summary = useAgedReceivablesQuery();
	const { data, isLoading, error } = useAgedReceivablesByClientQuery();
	const records = useMemo(() => data ?? [], [data]);

	const rows = useMemo(() => {
		const activeTerms = searchInput.trim() ? [...terms, searchInput.trim()] : terms;
		return records.filter((r) =>
			activeTerms.every((term) => r.clientName.toLowerCase().includes(term.toLowerCase())),
		);
	}, [records, searchInput, terms]);

	const totals = useMemo(() => {
		const acc: Record<(typeof AMOUNT_KEYS)[number], number> = {
			bucket0_30: 0,
			bucket31_60: 0,
			bucket61_90: 0,
			bucket90plus: 0,
			total: 0,
		};
		for (const r of rows) {
			for (const key of AMOUNT_KEYS) acc[key] += r[key];
		}
		return acc;
	}, [rows]);

	const { hidden, toggle, reset, columnVisibility, visibleColumns } = useColumnVisibility(
		"aged-receivables",
		COLS,
	);

	const displayRows = useMemo(
		() =>
			rows.map((r) => ({
				id: r.clientId,
				clientName: r.clientName,
				bucket0_30: formatCurrency(r.bucket0_30),
				bucket31_60: formatCurrency(r.bucket31_60),
				bucket61_90: formatCurrency(r.bucket61_90),
				bucket90plus: formatCurrency(r.bucket90plus),
				total: formatCurrency(r.total),
			})),
		[rows],
	);

	const footerRow = useMemo(
		() => ({
			clientName: "Total",
			...Object.fromEntries(AMOUNT_KEYS.map((k) => [k, formatCurrency(totals[k])])),
		}),
		[totals],
	);

	const clearAllFilters = () => {
		setSearchInput("");
		clearAll();
	};

	const hasActiveFilters = terms.length > 0;
	const showEmpty = rows.length === 0 && !isLoading && !error;

	return (
		<div className="text-text-primary">
			<PageHeader title="Aged Receivables" />

			{summary.data && (
				<div className="mb-4 h-72">
					<AgedReceivablesColumnChart data={summary.data} />
				</div>
			)}

			<PageControls
				className="mb-4"
				left={
					<SearchBar
						paramKey="search"
						placeholder="Search by client..."
						onValueChange={setSearchInput}
						onSubmit={addTerm}
					/>
				}
				right={
					<>
						<ExportExcelButton
							onExport={() =>
								exportReport({
									filename: datedFilename("aged-receivables"),
									sheetName: "Aged Receivables",
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
						<DollarSign size={48} className="mx-auto text-text-faint mb-3" />
						<h3 className="text-text-tertiary text-lg font-medium mb-2">
							No outstanding receivables
						</h3>
						<p className="text-text-muted text-sm">
							{hasActiveFilters
								? "Try adjusting your filters"
								: "Past-due invoice balances appear here once invoices go unpaid"}
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
						onRowClick={(row) => navigate(`/dispatch/clients/${row.id as string}`)}
					/>
				)}
			</div>
		</div>
	);
}
