import { useState, useMemo } from "react";
import { startOfMonth, endOfMonth, format } from "date-fns";
import {
	useOverviewQuery,
	useRevenueYTDQuery,
	useRevenueByJobTypeQuery,
	useLeadsBySourceQuery,
	useUnscheduledRevenueQuery,
	useQuotePipelineQuery,
	useArrivalPerformanceQuery,
	useAgedReceivablesQuery,
} from "../../hooks/useReports";
import OverviewSection from "../../components/reports/OverviewSection";
import RevenueYTDChart from "../../components/reports/RevenueYTDChart";
import UnscheduledRevenue from "../../components/reports/UnscheduledRevenue";
import RevenueByJobTypeChart from "../../components/reports/RevenueByJobTypeChart";
import LeadsBySourceChart from "../../components/reports/LeadsBySourceChart";
import QuotePipeline from "../../components/reports/QuotePipeline";
import ArrivalPerformanceChart from "../../components/reports/ArrivalPerformanceChart";
import AgedReceivablesColumnChart from "../../components/reports/AgedReceivablesColumnChart";
import ReportState from "../../components/reports/ReportState";
import PageHeader from "../../components/ui/PageHeader";
import DateRangeFilter from "../../components/ui/DateRangeFilter";
import {
	type DateRangeValue,
	type DateRangeOption,
	resolveDateRange,
} from "../../util/dateRangeUtils";

const KPI_PRESETS: DateRangeOption[] = [
	"today",
	"last_7_days",
	"last_30_days",
	"this_month",
	"custom",
];

export default function KPIPage() {
	const [range, setRange] = useState<DateRangeValue>({ option: "this_month" });

	const { startDateStr, endDateStr, startDate, endDate } = useMemo(() => {
		const now = new Date();
		const resolved =
			resolveDateRange(range) ?? {
				start: startOfMonth(now),
				end: endOfMonth(now),
			};
		return {
			startDate: resolved.start,
			endDate: resolved.end,
			startDateStr: resolved.start.toISOString(),
			endDateStr: resolved.end.toISOString(),
		};
	}, [range]);

	const rangeLabel = `${format(startDate, "MMM d, yyyy")} - ${format(endDate, "MMM d, yyyy")}`;

	const {
		data: overview,
		isLoading: overviewLoading,
		error: overviewError,
	} = useOverviewQuery(startDateStr, endDateStr);

	const {
		data: revenueYTD,
		isLoading: revenueLoading,
		error: revenueError,
	} = useRevenueYTDQuery();

	const {
		data: revenueByJobType,
		isLoading: byTypeLoading,
		error: byTypeError,
	} = useRevenueByJobTypeQuery(startDateStr, endDateStr);

	const {
		data: unscheduledRevenue,
		isLoading: unscheduledRevenueLoading,
		error: unscheduledRevenueError,
	} = useUnscheduledRevenueQuery();

	const {
		data: quotePipeline,
		isLoading: pipelineLoading,
		error: pipelineError,
	} = useQuotePipelineQuery(startDateStr, endDateStr);

	const {
		data: arrivalPerformance,
		isLoading: arrivalLoading,
		error: arrivalError,
	} = useArrivalPerformanceQuery(startDateStr, endDateStr);

	const {
		data: agedReceivables,
		isLoading: agedReceivablesLoading,
		error: agedReceivablesError,
	} = useAgedReceivablesQuery();

	const {
		data: leadsBySource,
		isLoading: leadsBySourceLoading,
		error: leadsBySourceError,
	} = useLeadsBySourceQuery(startDateStr, endDateStr);

	return (
		<div className="min-h-0 bg-canvas text-text-primary w-full">
			<div className="w-full px-4 sm:px-5 lg:px-6 py-4">
				{/* Header Section */}
				<PageHeader title="Key Performance Indicators">
					<DateRangeFilter value={range} onChange={setRange} presets={KPI_PRESETS} />
				</PageHeader>

				{/* Overview Section */}
				<div className="mb-5">
					<ReportState
						loading={overviewLoading}
						error={overviewError}
						errorMessage="Failed to load overview metrics"
						isEmpty={!overview}
						skeleton={
							<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
								{Array.from({ length: 4 }).map((_, i) => (
									<div
										key={i}
										className="bg-base border border-border-subtle rounded-lg p-4 h-24 animate-pulse"
									/>
								))}
							</div>
						}
					>
						{overview && <OverviewSection data={overview} />}
					</ReportState>
				</div>

				{/* Revenue Chart + Unscheduled Revenue */}
				<div className="grid grid-cols-1 lg:grid-cols-4 gap-3 sm:gap-4 mb-5">
					<div className="min-w-0 lg:col-span-3 h-[380px]">
						<ReportState
							loading={revenueLoading}
							error={revenueError}
							errorMessage="Failed to load revenue data"
							isEmpty={!revenueYTD}
							skeletonClassName="h-full rounded-xl"
						>
							{revenueYTD && (
								<RevenueYTDChart
									data={revenueYTD.data}
									total={revenueYTD.total}
									year={revenueYTD.year}
								/>
							)}
						</ReportState>
					</div>

					<div className="min-w-0 lg:col-span-1 h-[380px]">
						<ReportState
							loading={unscheduledRevenueLoading}
							error={unscheduledRevenueError}
							errorMessage="Failed to load unscheduled revenue"
							isEmpty={!unscheduledRevenue}
							skeletonClassName="h-full rounded-xl"
						>
							{unscheduledRevenue && <UnscheduledRevenue data={unscheduledRevenue} />}
						</ReportState>
					</div>
				</div>

				<div className="grid grid-cols-1 lg:grid-cols-3 gap-3 sm:gap-4">
					<div className="min-w-0 h-[420px]">
						<ReportState
							loading={byTypeLoading}
							error={byTypeError}
							errorMessage="Failed to load revenue by job type"
							isEmpty={!revenueByJobType}
							skeletonClassName="h-full rounded-xl"
						>
							{revenueByJobType && (
								<RevenueByJobTypeChart
									data={revenueByJobType.data}
									total={revenueByJobType.total}
								/>
							)}
						</ReportState>
					</div>

					<div className="min-w-0 h-[420px]">
						<ReportState
							loading={pipelineLoading}
							error={pipelineError}
							errorMessage="Failed to load quote pipeline"
							isEmpty={!quotePipeline}
							skeletonClassName="h-full rounded-xl"
						>
							{quotePipeline && <QuotePipeline data={quotePipeline} />}
						</ReportState>
					</div>

					<div className="min-w-0 h-[420px]">
						<ReportState
							loading={arrivalLoading}
							error={arrivalError}
							errorMessage="Failed to load arrival performance"
							isEmpty={!arrivalPerformance}
							skeletonClassName="h-full rounded-xl"
						>
							{arrivalPerformance && (
								<ArrivalPerformanceChart
									data={arrivalPerformance}
									rangeLabel={rangeLabel}
								/>
							)}
						</ReportState>
					</div>
				</div>

				<div className="grid grid-cols-1 lg:grid-cols-3 gap-3 sm:gap-4 mt-5">
					<div className="min-w-0 h-[420px]">
						<ReportState
							loading={agedReceivablesLoading}
							error={agedReceivablesError}
							errorMessage="Failed to load aged receivables"
							isEmpty={!agedReceivables}
							skeletonClassName="h-full rounded-xl"
						>
							{agedReceivables && (
								<AgedReceivablesColumnChart data={agedReceivables} />
							)}
						</ReportState>
					</div>

					<div className="min-w-0 h-[420px]">
						<ReportState
							loading={leadsBySourceLoading}
							error={leadsBySourceError}
							errorMessage="Failed to load leads by source"
							isEmpty={!leadsBySource}
							skeletonClassName="h-full rounded-xl"
						>
							{leadsBySource && (
								<LeadsBySourceChart
									data={leadsBySource.data}
									total={leadsBySource.total}
								/>
							)}
						</ReportState>
					</div>
				</div>
			</div>
		</div>
	);
}
