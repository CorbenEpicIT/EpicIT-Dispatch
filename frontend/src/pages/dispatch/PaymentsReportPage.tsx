import { useMemo, useState } from "react";
import { Banknote } from "lucide-react";
import { useNavigate, useSearchParams } from "react-router-dom";
import SearchBar from "../../components/ui/SearchBar";
import FilterChips from "../../components/ui/FilterChips";
import PageControls from "../../components/ui/PageControls";
import PageHeader from "../../components/ui/PageHeader";
import ColumnsButton from "../../components/ui/ColumnsButton";
import ExportExcelButton from "../../components/reports/ExportExcelButton";
import AdaptableTable from "../../components/AdaptableTable";
import DateRangeFilter from "../../components/ui/DateRangeFilter";
import PaymentsByMethodChart from "../../components/reports/PaymentsByMethodChart";
import { exportReport } from "../../api/reports";
import { datedFilename } from "../../util/download";
import { useMultiSearch } from "../../hooks/useMultiSearch";
import {
	buildColumnAlign,
	buildHeaderLabels,
	useColumnVisibility,
	type ColumnOption,
} from "../../hooks/useColumnVisibility";
import { formatCurrency, formatDate } from "../../util/util";
import { parseDateRangeFromParams, resolveDateRange } from "../../util/dateRangeUtils";
import { usePaymentsReportQuery } from "../../hooks/useReports";

const COLS: ColumnOption[] = [
	{ key: "paidAt", label: "Paid" },
	{ key: "invoiceNumber", label: "Invoice #" },
	{ key: "clientName", label: "Client" },
	{ key: "amount", label: "Amount" },
	{ key: "method", label: "Method" },
	{ key: "recordedBy", label: "Recorded By" },
	{ key: "qbSynced", label: "QuickBooks" },
	{ key: "note", label: "Note" },
];

const TEXT_KEYS = ["invoiceNumber", "clientName", "method", "recordedBy"] as const;

const HEADER_LABELS = buildHeaderLabels(COLS);
const COLUMN_ALIGN = buildColumnAlign(COLS, ["amount"]);

export default function PaymentsReportPage() {
	const navigate = useNavigate();
	const [searchInput, setSearchInput] = useState("");
	const { terms, addTerm, removeTerm, clearAll, duplicateTerm } = useMultiSearch("search");

	const [searchParams] = useSearchParams();
	const dateRange = parseDateRangeFromParams(searchParams, "period");
	const resolved = resolveDateRange(dateRange);
	const startDate = resolved?.start.toISOString();
	const endDate = resolved?.end.toISOString();

	const { data, isLoading, error } = usePaymentsReportQuery(startDate, endDate);
	const records = useMemo(() => data ?? [], [data]);

	const rows = useMemo(() => {
		const activeTerms = searchInput.trim() ? [...terms, searchInput.trim()] : terms;
		return records.filter((r) =>
			activeTerms.every((term) => {
				const t = term.toLowerCase();
				return TEXT_KEYS.some((key) => String(r[key] ?? "").toLowerCase().includes(t));
			}),
		);
	}, [records, searchInput, terms]);

	const stats = useMemo(() => {
		const total = rows.reduce((s, r) => s + r.amount, 0);
		const count = rows.length;
		return [
			{
				label: "Total Collected",
				value: formatCurrency(total),
				hint: `${count} ${count === 1 ? "payment" : "payments"}`,
			},
			{ label: "Payments", value: String(count) },
			{ label: "Avg Payment", value: formatCurrency(count > 0 ? total / count : 0) },
		];
	}, [rows]);

	const byMethod = useMemo(() => {
		const map = new Map<string, { amount: number; count: number }>();
		for (const r of rows) {
			const method = r.method || "Unspecified";
			const bucket = map.get(method) ?? { amount: 0, count: 0 };
			bucket.amount += r.amount;
			bucket.count++;
			map.set(method, bucket);
		}
		return [...map.entries()]
			.map(([method, b]) => ({ method, ...b }))
			.sort((a, b) => b.amount - a.amount);
	}, [rows]);

	const totalCollected = useMemo(() => rows.reduce((s, r) => s + r.amount, 0), [rows]);

	const { hidden, toggle, reset, columnVisibility, visibleColumns } = useColumnVisibility(
		"payments-report",
		COLS,
	);

	const displayRows = useMemo(
		() =>
			rows.map((r) => ({
				id: r.invoiceId,
				paidAt: formatDate(r.paidAt),
				invoiceNumber: r.invoiceNumber,
				clientName: r.clientName,
				amount: formatCurrency(r.amount),
				method: r.method || "—",
				recordedBy: r.recordedBy ?? "—",
				qbSynced: r.qbSynced ? "Synced" : "—",
				note: r.note || "—",
			})),
		[rows],
	);

	const clearAllFilters = () => {
		setSearchInput("");
		clearAll();
	};

	const hasActiveFilters = terms.length > 0 || dateRange.option !== "all";
	const showEmpty = rows.length === 0 && !isLoading && !error;

	return (
		<div className="text-text-primary">
			<PageHeader title="Payments Collected" />

			<div className="grid grid-cols-3 gap-3 mb-4">
				{stats.map((card) => (
					<div key={card.label} className="p-4 bg-base border border-border-subtle rounded-lg">
						<p className="text-xs text-text-muted uppercase tracking-wide font-semibold mb-1">
							{card.label}
						</p>
						<p className="text-xl font-bold text-text-primary tabular-nums">{card.value}</p>
						{"hint" in card && card.hint && (
							<p className="text-xs text-text-muted mt-0.5">{card.hint}</p>
						)}
					</div>
				))}
			</div>

			{!isLoading && !error && rows.length > 0 && (
				<div className="mb-4 h-72">
					<PaymentsByMethodChart data={byMethod} total={totalCollected} />
				</div>
			)}

			<PageControls
				className="mb-4"
				left={
					<SearchBar
						paramKey="search"
						placeholder="Search by client, invoice, or method..."
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
									filename: datedFilename("payments-collected"),
									sheetName: "Payments",
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
						<Banknote size={48} className="mx-auto text-text-faint mb-3" />
						<h3 className="text-text-tertiary text-lg font-medium mb-2">
							No payments found
						</h3>
						<p className="text-text-muted text-sm">
							{hasActiveFilters
								? "Try adjusting your filters"
								: "Payments recorded against invoices appear here"}
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
						onRowClick={(row) => navigate(`/dispatch/invoices/${row.id as string}`)}
					/>
				)}
			</div>
		</div>
	);
}
