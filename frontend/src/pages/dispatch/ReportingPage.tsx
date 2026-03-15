import { useState, useMemo } from "react";
import { startOfMonth, endOfMonth, format } from "date-fns";
import { AlertCircle } from "lucide-react";
import {
	useOverviewQuery,
	useRevenueYTDQuery,
	useRevenueByJobTypeQuery,
	useUnscheduledRevenueQuery,
	useQuotePipelineQuery,
	useArrivalPerformanceQuery,
} from "../../hooks/useReports";
import OverviewSection from "../../components/reports/OverviewSection";
import RevenueOverviewSection from "../../components/reports/RevenueOverviewSection";
import RevenueByJobTypeChart from "../../components/reports/RevenueByJobTypeChart";
import QuotePipeline from "../../components/reports/QuotePipeline";
import ArrivalPerformanceChart from "../../components/reports/ArrivalPerformanceChart";
import DatePicker from "../../components/ui/DatePicker";

export default function ReportingPage() {
	const now = new Date();
	const [startDate, setStartDate] = useState<Date | null>(startOfMonth(now));
	const [endDate, setEndDate] = useState<Date | null>(endOfMonth(now));

	const startDateStr = useMemo(
		() => startDate?.toISOString() ?? startOfMonth(now).toISOString(),
		[startDate],
	);
	const endDateStr = useMemo(
		() => endDate?.toISOString() ?? endOfMonth(now).toISOString(),
		[endDate],
	);

	const rangeLabel =
		startDate && endDate
			? `${format(startDate, "MMM d, yyyy")} - ${format(endDate, "MMM d, yyyy")}`
			: "";

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

	return (
		<div className="min-h-0 bg-zinc-950 text-zinc-100 w-full">
			<div className="w-full px-4 sm:px-5 lg:px-6 py-4">
				{/* Header Section */}
				<div className="flex items-center justify-between mb-5">
					<h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight">
						Reports
					</h1>
					<div className="flex items-center gap-2">
						<div className="w-56"><DatePicker value={startDate} onChange={setStartDate} required /></div>
						<span className="text-zinc-500 text-sm">to</span>
						<div className="w-56"><DatePicker value={endDate} onChange={setEndDate} required align="right" /></div>
					</div>
				</div>

				{/* Overview Section */}
				{overviewError ? (
					<div className="flex items-center gap-2 p-4 bg-red-500/10 border border-red-500/20 rounded-lg mb-5">
						<AlertCircle size={16} className="text-red-400" />
						<p className="text-sm text-red-400">
							Failed to load overview metrics
						</p>
					</div>
				) : overview ? (
					<div className="mb-5">
						<OverviewSection data={overview} />
					</div>
				) : overviewLoading ? (
					<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-5">
						{Array.from({ length: 4 }).map((_, i) => (
							<div key={i} className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 h-24 animate-pulse" />
						))}
					</div>
				) : null}

				{/* Revenue Chart + Unscheduled Revenue */}
				<div className="mb-5">
					<RevenueOverviewSection
						revenueYTD={revenueYTD}
						revenueLoading={revenueLoading}
						revenueError={revenueError}
						unscheduledRevenue={unscheduledRevenue}
						unscheduledRevenueLoading={unscheduledRevenueLoading}
						unscheduledRevenueError={unscheduledRevenueError}
					/>
				</div>

				{/* Bottom Row */}
				<div className="grid grid-cols-1 lg:grid-cols-3 gap-3 sm:gap-4">
					<div className="min-w-0 h-full">
						{byTypeError ? (
							<div className="flex items-center gap-2 p-4 bg-red-500/10 border border-red-500/20 rounded-lg">
								<AlertCircle size={16} className="text-red-400" />
								<p className="text-sm text-red-400">
									Failed to load revenue by job type
								</p>
							</div>
						) : byTypeLoading ? (
							<div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 h-[400px] animate-pulse" />
						) : revenueByJobType ? (
							<RevenueByJobTypeChart
								data={revenueByJobType.data}
								total={revenueByJobType.total}
							/>
						) : null}
					</div>

					<div className="min-w-0 h-full">
						{pipelineError ? (
							<div className="flex items-center gap-2 p-4 bg-red-500/10 border border-red-500/20 rounded-lg">
								<AlertCircle size={16} className="text-red-400" />
								<p className="text-sm text-red-400">
									Failed to load quote pipeline
								</p>
							</div>
						) : pipelineLoading ? (
							<div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 h-[400px] animate-pulse" />
						) : quotePipeline ? (
							<QuotePipeline data={quotePipeline} />
						) : null}
					</div>

					<div className="min-w-0 h-full">
						{arrivalError ? (
							<div className="flex items-center gap-2 p-4 bg-red-500/10 border border-red-500/20 rounded-lg">
								<AlertCircle size={16} className="text-red-400" />
								<p className="text-sm text-red-400">
									Failed to load arrival performance
								</p>
							</div>
						) : arrivalLoading ? (
							<div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 h-[400px] animate-pulse" />
						) : arrivalPerformance ? (
							<ArrivalPerformanceChart
								data={arrivalPerformance}
								rangeLabel={rangeLabel}
							/>
						) : null}
					</div>
				</div>
			</div>
		</div>
	);
}
