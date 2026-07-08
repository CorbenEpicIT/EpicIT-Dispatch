import { useMemo, useState } from "react";
import { HardHat, ArrowLeft } from "lucide-react";
import { useNavigate, useLocation, useSearchParams } from "react-router-dom";
import AdaptableTable from "../../components/AdaptableTable";
import SearchBar from "../../components/ui/SearchBar";
import FilterChips from "../../components/ui/FilterChips";
import PageControls from "../../components/ui/PageControls";
import DateRangeFilter from "../../components/ui/DateRangeFilter";
import PageHeader from "../../components/ui/PageHeader";
import ColumnsButton from "../../components/ui/ColumnsButton";
import ExportExcelButton from "../../components/reports/ExportExcelButton";
import TechRevenuePerHourChart from "../../components/reports/TechRevenuePerHourChart";
import { useMultiSearch } from "../../hooks/useMultiSearch";
import {
	buildHeaderLabels,
	useColumnVisibility,
	type ColumnOption,
} from "../../hooks/useColumnVisibility";
import { parseDateRangeFromParams, resolveDateRange } from "../../util/dateRangeUtils";
import { formatCurrency, formatDate } from "../../util/util";
import { useTechnicianScorecardQuery } from "../../hooks/useReports";
import { exportReport } from "../../api/reports";
import { datedFilename } from "../../util/download";
import type { TechScorecardVisitRow } from "../../types/reports";

const fmtHours = (h: number) => h.toFixed(1);

const SUMMARY_COLS: ColumnOption[] = [
	{ key: "technician", label: "Technician" },
	{ key: "visits", label: "Visits" },
	{ key: "jobs", label: "Jobs" },
	{ key: "hours", label: "Hours" },
	{ key: "revenue", label: "Revenue" },
	{ key: "revenuePerHour", label: "Revenue / Hr" },
	{ key: "onTimeRate", label: "On-time %" },
];

const DETAIL_COLS: ColumnOption[] = [
	{ key: "date", label: "Date" },
	{ key: "job", label: "Job" },
	{ key: "client", label: "Client" },
	{ key: "arrival", label: "Arrival" },
	{ key: "hours", label: "Hours" },
	{ key: "revenueShare", label: "Revenue Share" },
];

const SUMMARY_HEADER_LABELS = buildHeaderLabels(SUMMARY_COLS);
const DETAIL_HEADER_LABELS = buildHeaderLabels(DETAIL_COLS);

interface TechRollup {
	techId: string;
	techName: string;
	visits: number;
	jobs: number;
	hours: number;
	revenue: number;
	arrivalsTracked: number;
	arrivalsOnTime: number;
}

function rollupByTech(records: TechScorecardVisitRow[]): TechRollup[] {
	const map = new Map<string, TechRollup>();
	for (const r of records) {
		const cur = map.get(r.techId) ?? {
			techId: r.techId,
			techName: r.techName,
			visits: 0,
			jobs: 0,
			hours: 0,
			revenue: 0,
			arrivalsTracked: 0,
			arrivalsOnTime: 0,
		};
		cur.visits++;
		cur.hours += r.hoursWorked;
		cur.revenue += r.revenueShare;
		if (r.arrival) {
			cur.arrivalsTracked++;
			if (r.arrival !== "Late") cur.arrivalsOnTime++;
		}
		map.set(r.techId, cur);
	}
	const jobSets = new Map<string, Set<string>>();
	for (const r of records) {
		const set = jobSets.get(r.techId) ?? new Set<string>();
		set.add(r.jobId);
		jobSets.set(r.techId, set);
	}
	return [...map.values()].map((t) => ({ ...t, jobs: jobSets.get(t.techId)?.size ?? 0 }));
}

const onTimeLabel = (tracked: number, onTime: number) =>
	tracked > 0 ? `${Math.round((onTime / tracked) * 100)}%` : "—";

export default function TechnicianScorecardPage() {
	const navigate = useNavigate();
	const location = useLocation();
	const [searchInput, setSearchInput] = useState("");
	const { terms, addTerm, removeTerm, duplicateTerm } = useMultiSearch("search");

	const [searchParams] = useSearchParams();
	const dateRange = parseDateRangeFromParams(searchParams, "period");
	const resolved = resolveDateRange(dateRange);
	const startDate = resolved?.start.toISOString();
	const endDate = resolved?.end.toISOString();

	const { data, isLoading, error } = useTechnicianScorecardQuery(startDate, endDate);
	const records = useMemo(() => data ?? [], [data]);

	const queryParams = useMemo(() => new URLSearchParams(location.search), [location.search]);
	const techRaw = queryParams.get("tech");
	const techParam = techRaw ? decodeURIComponent(techRaw) : null;
	const isSummaryView = techParam === null;

	const rollups = useMemo(() => rollupByTech(records), [records]);

	// ── Summary ──────────────────────────────────────────────────────────
	const { summaryRows, summaryStats, chartData } = useMemo(() => {
		const activeTerms = searchInput.trim() ? [...terms, searchInput.trim()] : terms;
		const surviving = rollups.filter((t) =>
			activeTerms.every((term) => t.techName.toLowerCase().includes(term.toLowerCase())),
		);

		const sorted = [...surviving].sort((a, b) => b.revenue - a.revenue);

		const totalRevenue = surviving.reduce((s, t) => s + t.revenue, 0);
		const totalVisits = surviving.reduce((s, t) => s + t.visits, 0);
		const tracked = surviving.reduce((s, t) => s + t.arrivalsTracked, 0);
		const onTime = surviving.reduce((s, t) => s + t.arrivalsOnTime, 0);

		return {
			summaryRows: sorted.map((t) => ({
				id: t.techName,
				technician: t.techName,
				visits: t.visits,
				jobs: t.jobs,
				hours: fmtHours(t.hours),
				revenue: formatCurrency(t.revenue),
				revenuePerHour: t.hours > 0 ? formatCurrency(t.revenue / t.hours) : "—",
				onTimeRate: onTimeLabel(t.arrivalsTracked, t.arrivalsOnTime),
			})),
			summaryStats: [
				{
					label: "Attributed Revenue",
					value: formatCurrency(totalRevenue),
					hint: `${surviving.length} ${surviving.length === 1 ? "technician" : "technicians"}`,
				},
				{ label: "Visits Completed", value: String(totalVisits) },
				{ label: "On-time Rate", value: onTimeLabel(tracked, onTime) },
			],
			chartData: sorted
				.filter((t) => t.hours > 0)
				.map((t) => ({
					techName: t.techName,
					revenuePerHour: Math.round((t.revenue / t.hours) * 100) / 100,
					revenue: t.revenue,
					hours: t.hours,
				}))
				.sort((a, b) => b.revenuePerHour - a.revenuePerHour)
				.slice(0, 5),
		};
	}, [rollups, searchInput, terms]);

	// ── Detail ───────────────────────────────────────────────────────────
	const { detailRows, detailStats } = useMemo(() => {
		if (isSummaryView) return { detailRows: [], detailStats: [] };

		const activeTerms = searchInput.trim() ? [...terms, searchInput.trim()] : terms;
		const filtered = records
			.filter((r) => r.techName === techParam)
			.filter((r) =>
				activeTerms.every((term) => {
					const t = term.toLowerCase();
					return (
						r.jobName.toLowerCase().includes(t) ||
						r.clientName.toLowerCase().includes(t) ||
						formatDate(r.scheduledStartAt).toLowerCase().includes(t)
					);
				}),
			)
			.sort(
				(a, b) =>
					new Date(b.scheduledStartAt).getTime() - new Date(a.scheduledStartAt).getTime(),
			);

		const revenue = filtered.reduce((s, r) => s + r.revenueShare, 0);
		const hours = filtered.reduce((s, r) => s + r.hoursWorked, 0);
		const tracked = filtered.filter((r) => r.arrival).length;
		const onTime = filtered.filter((r) => r.arrival && r.arrival !== "Late").length;

		return {
			detailRows: filtered.map((r) => ({
				id: r.visitId,
				date: formatDate(r.scheduledStartAt),
				job: r.jobName,
				client: r.clientName,
				arrival: r.arrival ?? "—",
				hours: fmtHours(r.hoursWorked),
				revenueShare: formatCurrency(r.revenueShare),
			})),
			detailStats: [
				{ label: "Attributed Revenue", value: formatCurrency(revenue) },
				{
					label: "Hours Worked",
					value: fmtHours(hours),
					hint: `${filtered.length} ${filtered.length === 1 ? "visit" : "visits"}`,
				},
				{ label: "On-time Rate", value: onTimeLabel(tracked, onTime) },
			],
		};
	}, [records, isSummaryView, techParam, searchInput, terms]);

	const columnDefs = isSummaryView ? SUMMARY_COLS : DETAIL_COLS;
	const { hidden, toggle, reset, columnVisibility, visibleColumns } = useColumnVisibility(
		`tech-scorecard:${isSummaryView ? "summary" : "detail"}`,
		columnDefs,
	);

	const headerLabels = isSummaryView ? SUMMARY_HEADER_LABELS : DETAIL_HEADER_LABELS;

	const handleTechClick = (techName: string) => {
		setSearchInput("");
		const next = new URLSearchParams(location.search);
		next.delete("search");
		next.set("tech", encodeURIComponent(techName));
		navigate(`/dispatch/reporting/technician-scorecard?${next.toString()}`);
	};

	const handleBackToSummary = () => {
		setSearchInput("");
		const next = new URLSearchParams(location.search);
		next.delete("tech");
		next.delete("search");
		const qs = next.toString();
		navigate(`/dispatch/reporting/technician-scorecard${qs ? `?${qs}` : ""}`);
	};

	const clearAllFilters = () => {
		setSearchInput("");
		const next = new URLSearchParams(location.search);
		next.delete("search");
		next.delete("period");
		next.delete("periodFrom");
		next.delete("periodTo");
		navigate(
			`/dispatch/reporting/technician-scorecard${
				techParam ? `?tech=${encodeURIComponent(techParam)}` : ""
			}`,
		);
	};

	const hasActiveFilters = terms.length > 0 || dateRange.option !== "all";
	const rows = isSummaryView ? summaryRows : detailRows;
	const stats = isSummaryView ? summaryStats : detailStats;
	const showEmpty = rows.length === 0 && !isLoading && !error;

	return (
		<div className="text-text-primary">
			<PageHeader
				title={isSummaryView ? "Technician Scorecard" : (techParam ?? "Technician Scorecard")}
				subtitle={
					!isSummaryView ? (
						<button
							onClick={handleBackToSummary}
							className="flex items-center gap-1.5 text-sm text-text-muted hover:text-text-primary transition-colors mt-0.5"
						>
							<ArrowLeft size={14} />
							All Technicians
						</button>
					) : undefined
				}
			/>

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

			{isSummaryView && !isLoading && !error && chartData.length > 0 && (
				<div className="mb-4 h-72">
					<TechRevenuePerHourChart data={chartData} />
				</div>
			)}

			<PageControls
				className="mb-4"
				left={
					<SearchBar
						key={isSummaryView ? "summary-search" : "detail-search"}
						paramKey="search"
						placeholder={
							isSummaryView
								? "Search by technician..."
								: "Search by job, client, or date..."
						}
						onValueChange={setSearchInput}
						onSubmit={addTerm}
					/>
				}
				middle={<DateRangeFilter paramKey="period" />}
				right={
					<>
						<ExportExcelButton
							onExport={() =>
								exportReport({
									filename: datedFilename(
										isSummaryView
											? "technician-scorecard"
											: `technician-scorecard-${techParam}`,
									),
									sheetName: "Scorecard",
									columns: visibleColumns,
									rows,
								})
							}
							disabled={rows.length === 0}
						/>
						<ColumnsButton
							columns={columnDefs}
							hidden={hidden}
							onToggle={toggle}
							onReset={reset}
						/>
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
						<HardHat size={48} className="mx-auto text-text-faint mb-3" />
						<h3 className="text-text-tertiary text-lg font-medium mb-2">
							No completed visits found
						</h3>
						<p className="text-text-muted text-sm">
							{hasActiveFilters
								? "Try adjusting your filters"
								: "Completed visits with assigned technicians appear here"}
						</p>
					</div>
				) : (
					<AdaptableTable
						data={rows}
						loadListener={isLoading}
						errListener={error}
						formatNums={false}
						columnVisibility={columnVisibility}
						headerLabels={headerLabels}
						onRowClick={
							isSummaryView ? (row) => handleTechClick(row.id as string) : undefined
						}
					/>
				)}
			</div>
		</div>
	);
}
