import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { startOfMonth, endOfMonth } from "date-fns";
import { usePageSummaryQuery } from "../../hooks/useReports";
import PageSummary from "./PageSummary";
import DateRangeFilter from "../ui/DateRangeFilter";
import type { DateRangeValue, DateRangeOption } from "../../util/dateRangeUtils";
import { resolveDateRange, serializeDateRange } from "../../util/dateRangeUtils";
import { useNavigate } from "react-router-dom";
import { useQBStatusQuery } from "../../hooks/useQuickbooks";

interface PageReportSectionProps {
	page: string;
	label?: string;
	defaultOpen?: boolean;
	showTimeline?: boolean;
}

const DATE_PRESETS: DateRangeOption[] = [
	"today",
	"last_7_days",
	"last_30_days",
	"this_month",
	"custom",
];

const BREAKDOWNS: Record<string, string[]> = {
	jobs: ["status", "priority", "type"],
	quotes: ["status", "priority"],
	requests: ["status", "priority"],
	invoices: ["status", "qb_sync"],
	clients: ["status", "tax_exempt"],
	inventory: ["status", "qb_linked"],
};

const DIMENSION_LABELS: Record<string, string> = {
	status: "Status",
	priority: "Priority",
	type: "Type",
	qb_sync: "QB Sync",
	qb_linked: "QuickBooks",
	tax_exempt: "Tax Status",
};

// Mounted only when expanded, so the summary query runs on demand
function ReportBody(
	{ page, startDate, endDate, groupBy, range }:
	{ page: string; startDate?: string; endDate?: string; groupBy?: string; range: DateRangeValue }
) {
	const { data, isLoading, error } = usePageSummaryQuery(page, startDate, endDate, groupBy);
	const navigate = useNavigate();
	const getHref = (label: string): string | null => {
		if (groupBy === "status") {
			let statusValue: string | null = null;
			if (page === "clients") {
				statusValue = label === "Active" ? "active" : label === "Inactive" ? "inactive" : null;
			} else if (["jobs", "quotes", "requests", "invoices"].includes(page)) {
				statusValue = label;
			}
			if (!statusValue) return null;

			let params = new URLSearchParams({ status: statusValue });
			// The Jobs list filters by SCHEDULED date, so Unscheduled/Cancelled jobs get dropped
			const noScheduleDate = ["Unscheduled", "Cancelled"].includes(statusValue);
			const carryDate =
				page === "jobs"
					? !noScheduleDate
					: ["quotes", "requests", "invoices"].includes(page);
			if (carryDate) {
				params = serializeDateRange(range, "date", params);
			}
			return `/dispatch/${page}?${params.toString()}`;
		}

		if (groupBy === "priority") {
			if (!["jobs", "quotes", "requests"].includes(page)) return null;
			let params = new URLSearchParams({ priority: label });
			if (["quotes", "requests"].includes(page)) {
				params = serializeDateRange(range, "date", params);
			}
			return `/dispatch/${page}?${params.toString()}`;
		}

		return null;
	};

	if (error)
		return (
			<div className="py-6 text-center text-sm text-text-faint">
				Failed to load report.
			</div>
		);
	if (isLoading || !data)
		return <div className="min-h-40 animate-pulse rounded-md bg-surface-raised" />;

	const canFilter =
		(groupBy === "status" &&
			["jobs", "quotes", "requests", "invoices", "clients"].includes(page)) ||
		(groupBy === "priority" && ["jobs", "quotes", "requests"].includes(page));

	return (
		<PageSummary
			data={data}
			onBarClick={
				canFilter
					?   (label) => {
							const href = getHref(label);
							if (href) navigate(href);
						}
					: undefined
			}
		/>
	);
}

export default function PageReportSection({
	page,
	label = "Report",
	defaultOpen = false,
	showTimeline = true,
}: PageReportSectionProps) {
	const [open, setOpen] = useState(defaultOpen);
	const [range, setRange] = useState<DateRangeValue>({ option: "this_month"});
	const [groupBy, setGroupBy] = useState<string>(BREAKDOWNS[page][0]);

	// QuickBooks breakdowns (qb_sync, qb_linked) are only used when QB is connected
	const hasQbDim = (BREAKDOWNS[page] ?? []).some((d) => d.startsWith("qb_"));
	const qbConnected = useQBStatusQuery(hasQbDim).data?.connected ?? false;
	const options = useMemo(() => {
		const base = BREAKDOWNS[page] ?? ["status"];
		return hasQbDim && !qbConnected
			? base.filter((d) => !d.startsWith("qb_"))
			: base;
	}, [page, hasQbDim, qbConnected]);
	// Clamp the active dimension in case it was dropped 
	const effectiveGroupBy = options.includes(groupBy) ? groupBy : options[0];

	const { startDateStr, endDateStr } = useMemo(() => {
		const now = new Date();
		const resolved =
			resolveDateRange(range) ?? {
				start: startOfMonth(now),
				end: endOfMonth(now),
			};
		return {
			startDateStr: resolved.start.toISOString(),
			endDateStr: resolved.end.toISOString(),
		};
	}, [range]);

	return (
		<div className="mb-4 rounded-lg border border-border-subtle bg-base">
			<div className="flex w-full items-center gap-2 px-3 py-2">
				<button
					onClick={() => setOpen((v) => !v)}
					aria-expanded={open}
					className="flex flex-1 items-center gap-2 text-left text-sm font-medium text-text-secondary transition-colors hover:text-text-primary"
				>
					{open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
					{label}
				</button>
				{open && options.length > 1 && (
					<select
						value={effectiveGroupBy}
						onChange={(e) => setGroupBy(e.target.value)}
						aria-label="Group breakdown by"
						className="flex h-9 cursor-pointer items-center whitespace-nowrap rounded-md border border-border bg-surface px-3 text-sm text-text-tertiary transition-colors hover:text-text-primary"
					>
						{options.map((p) => (
							<option key={p} value={p}>
								{DIMENSION_LABELS[p] ?? p}
							</option>
						))}
					</select>
				)}
				{open && showTimeline && (
					<DateRangeFilter value={range} onChange={setRange} presets={DATE_PRESETS} />
				)}
			</div>
			{open && (
				<div className="border-t border-border-subtle p-3">
					<ReportBody
						page={page}
						startDate={startDateStr}
						endDate={endDateStr}
						groupBy={effectiveGroupBy}
						range={range}
					/>
				</div>
			)}
		</div>
	);
}
