import { AlertCircle } from "lucide-react";
import RevenueYTDChart from "./RevenueYTDChart";
import UnscheduledRevenue from "./UnscheduledRevenue";
import type { RevenueYTDResponse, UnscheduledRevenueResponse } from "../../types/reports";

interface RevenueOverviewSectionProps {
	revenueYTD: RevenueYTDResponse | undefined;
	revenueLoading: boolean;
	revenueError: Error | null;
	unscheduledRevenue: UnscheduledRevenueResponse | undefined;
	unscheduledRevenueLoading: boolean;
	unscheduledRevenueError: Error | null;
}

export default function RevenueOverviewSection({
	revenueYTD,
	revenueLoading,
	revenueError,
	unscheduledRevenue,
	unscheduledRevenueLoading,
	unscheduledRevenueError,
}: RevenueOverviewSectionProps) {
	return (
		<div className="grid grid-cols-12 bg-base border border-border-subtle rounded-xl overflow-hidden">
			{/* RevenueYTD Chart */}
			<div className="col-span-12 lg:col-span-9 p-5 border-b lg:border-b-0 lg:border-r border-border-subtle">
				{revenueError ? (
					<div className="flex items-center justify-center h-full">
						<div className="flex items-center gap-2 p-4 bg-error/10 border border-error/20 rounded-lg">
							<AlertCircle size={16} className="text-error-text" />
							<p className="text-sm text-error-text">
								Failed to load revenue data
							</p>
						</div>
					</div>
				) : revenueLoading ? (
					<div className="h-[320px] animate-pulse bg-surface/50 rounded-lg" />
				) : revenueYTD ? (
					<div className="h-[320px]">
						<RevenueYTDChart
							data={revenueYTD.data}
							total={revenueYTD.total}
							year={revenueYTD.year}
						/>
					</div>
				) : null}
			</div>

			{/* Unscheduled Job Revenue on the right side of the RevenueYTDChart */}
			<div className="col-span-12 lg:col-span-3 p-4">
				{unscheduledRevenueError ? (
					<div className="flex items-center gap-2 p-3 bg-error/10 border border-error/20 rounded-lg">
						<AlertCircle size={14} className="text-error-text" />
						<p className="text-xs text-error-text">
							Failed to load Unscheduled Job Revenue
						</p>
					</div>
				) : unscheduledRevenueLoading ? (
					<div className="h-[320px] animate-pulse bg-surface/50 rounded-lg" />
				) : unscheduledRevenue ? (
					<div className="h-[320px]">
						<UnscheduledRevenue data={unscheduledRevenue} />
					</div>
				) : null}
			</div>
		</div>
	);
}
