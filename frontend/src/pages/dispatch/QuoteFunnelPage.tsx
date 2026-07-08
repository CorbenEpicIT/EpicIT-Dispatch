import { useMemo, useState } from "react";
import { Filter } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import SearchBar from "../../components/ui/SearchBar";
import FilterChips from "../../components/ui/FilterChips";
import PageControls from "../../components/ui/PageControls";
import PageHeader from "../../components/ui/PageHeader";
import ColumnsButton from "../../components/ui/ColumnsButton";
import ExportExcelButton from "../../components/reports/ExportExcelButton";
import AdaptableTable from "../../components/AdaptableTable";
import DateRangeFilter from "../../components/ui/DateRangeFilter";
import QuoteFunnelChart from "../../components/reports/QuoteFunnelChart";
import Card from "../../components/ui/Card";
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
import { useQuoteFunnelQuery } from "../../hooks/useReports";

const COLS: ColumnOption[] = [
	{ key: "quoteNumber", label: "Quote #" },
	{ key: "title", label: "Title" },
	{ key: "clientName", label: "Client" },
	{ key: "status", label: "Status" },
	{ key: "source", label: "Source" },
	{ key: "total", label: "Total" },
	{ key: "createdAt", label: "Created" },
	{ key: "sentAt", label: "Sent" },
	{ key: "viewedAt", label: "Viewed" },
	{ key: "approvedAt", label: "Approved" },
	{ key: "daysToApprove", label: "Days to Approve" },
];

const TEXT_KEYS = ["quoteNumber", "title", "clientName", "status", "source"] as const;

const HEADER_LABELS = buildHeaderLabels(COLS);
const COLUMN_ALIGN = buildColumnAlign(COLS, ["total", "daysToApprove"]);

const dateCell = (value: string | null) => (value ? formatDate(value) : "—");

export default function QuoteFunnelPage() {
	const [searchInput, setSearchInput] = useState("");
	const { terms, addTerm, removeTerm, clearAll, duplicateTerm } = useMultiSearch("search");

	const [searchParams] = useSearchParams();
	const dateRange = parseDateRangeFromParams(searchParams, "period");
	const resolved = resolveDateRange(dateRange);
	const startDate = resolved?.start.toISOString();
	const endDate = resolved?.end.toISOString();

	const { data, isLoading, error } = useQuoteFunnelQuery(startDate, endDate);
	const records = useMemo(() => data?.quotes ?? [], [data]);

	const rows = useMemo(() => {
		const activeTerms = searchInput.trim() ? [...terms, searchInput.trim()] : terms;
		return records.filter((r) =>
			activeTerms.every((term) => {
				const t = term.toLowerCase();
				return TEXT_KEYS.some((key) => String(r[key] ?? "").toLowerCase().includes(t));
			}),
		);
	}, [records, searchInput, terms]);

	const stats = useMemo(
		() => [
			{
				label: "Win Rate",
				value: data?.winRate != null ? `${data.winRate}%` : "—",
				hint: "of completed quotes",
			},
			{
				label: "Avg Days to Approve",
				value: data?.avgDaysToApprove != null ? String(data.avgDaysToApprove) : "—",
			},
			{ label: "Value Won", value: formatCurrency(data?.valueWon ?? 0) },
			{ label: "Value Lost", value: formatCurrency(data?.valueLost ?? 0) },
		],
		[data],
	);

	const { hidden, toggle, reset, columnVisibility, visibleColumns } = useColumnVisibility(
		"quote-funnel",
		COLS,
	);

	const displayRows = useMemo(
		() =>
			rows.map((r) => ({
				id: r.quoteId,
				quoteNumber: r.quoteNumber,
				title: r.title,
				clientName: r.clientName,
				status: r.status,
				source: r.source,
				total: formatCurrency(r.total),
				createdAt: dateCell(r.createdAt),
				sentAt: dateCell(r.sentAt),
				viewedAt: dateCell(r.viewedAt),
				approvedAt: dateCell(r.approvedAt),
				daysToApprove: r.daysToApprove != null ? String(r.daysToApprove) : "—",
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
			<PageHeader title="Quote Conversion" />

			<div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
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

			{data && !isLoading && !error && (
				<div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
					<div className="h-80">
						<QuoteFunnelChart funnel={data.funnel} />
					</div>
					<div className="h-80">
						<Card className="h-full" title="Conversion by Source">
							{data.bySource.length === 0 ? (
								<div className="flex-1 min-h-0 flex items-center justify-center">
									<p className="text-sm text-text-muted">
										No quotes in this period
									</p>
								</div>
							) : (
								<div className="flex-1 min-h-0 overflow-y-auto">
									<table className="w-full text-sm">
										<thead>
											<tr className="text-text-tertiary font-semibold border-b border-border-subtle">
												<th className="text-left p-2">Source</th>
												<th className="text-right p-2">Quotes</th>
												<th className="text-right p-2">Approved</th>
												<th className="text-right p-2">Rate</th>
											</tr>
										</thead>
										<tbody>
											{data.bySource.map((s) => (
												<tr
													key={s.source}
													className="border-t border-border-subtle"
												>
													<td className="p-2 capitalize">{s.source}</td>
													<td className="p-2 text-right tabular-nums">
														{s.quotes}
													</td>
													<td className="p-2 text-right tabular-nums">
														{s.approved}
													</td>
													<td className="p-2 text-right tabular-nums">
														{s.rate}%
													</td>
												</tr>
											))}
										</tbody>
									</table>
								</div>
							)}
						</Card>
					</div>
				</div>
			)}

			<PageControls
				className="mb-4"
				left={
					<SearchBar
						paramKey="search"
						placeholder="Search by quote, client, status, or source..."
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
									filename: datedFilename("quote-funnel"),
									sheetName: "Quotes",
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
						<Filter size={48} className="mx-auto text-text-faint mb-3" />
						<h3 className="text-text-tertiary text-lg font-medium mb-2">No quotes found</h3>
						<p className="text-text-muted text-sm">
							{hasActiveFilters
								? "Try adjusting your filters"
								: "Quotes appear here as they move through the pipeline"}
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
					/>
				)}
			</div>
		</div>
	);
}
