import { useEffect, useRef, useState } from "react";
import { useContainerWidth } from "react-grid-layout";
import { useRevenueYTDQuery, useUnscheduledRevenueQuery } from "../../hooks/useReports";
import RevenueOverviewSection from "../reports/RevenueOverviewSection";
import RevenueYTDChart from "../reports/RevenueYTDChart";
import Card from "../ui/Card";
import { AlertCircle } from "lucide-react";

export default function RevenueWidget() {
	const { containerRef, width } = useContainerWidth();

	const { data: revenueYTD, isLoading: revenueLoading, error: revenueError } = useRevenueYTDQuery();
	const { data: unscheduledRevenue, isLoading: unscheduledLoading, error: unscheduledError } = useUnscheduledRevenueQuery();

	// Below 600px the side-by-side grid overflows — show only the main chart
	const compact = width > 0 && width < 600;

	return (
		<Card className="h-full" >
			<div ref={containerRef} className="flex-1 flex flex-col w-full min-h-0">
				{compact ? (
					revenueError ? (
						<div className="flex items-center gap-2 p-4 bg-error/10 border border-error/20 rounded-lg w-full">
							<AlertCircle size={16} className="text-error-text" />
							<p className="text-sm text-error-text">Failed to load revenue data</p>
						</div>
					) : revenueLoading ? (
						<div className="w-full flex-1 animate-pulse bg-surface/50 rounded-lg" />
					) : revenueYTD ? (
						<div className="flex-1 min-h-0 relative">
							<div className="absolute inset-0 overflow-auto">
								<RevenueOverviewSection
									revenueYTD={revenueYTD}
									revenueLoading={revenueLoading}
									revenueError={revenueError ?? null}
									unscheduledRevenue={unscheduledRevenue}
									unscheduledRevenueLoading={unscheduledLoading}
									unscheduledRevenueError={unscheduledError ?? null}
								/>
							</div>
						</div>
					) : null
				) : (
					<RevenueOverviewSection
						revenueYTD={revenueYTD}
						revenueLoading={revenueLoading}
						revenueError={revenueError ?? null}
						unscheduledRevenue={unscheduledRevenue}
						unscheduledRevenueLoading={unscheduledLoading}
						unscheduledRevenueError={unscheduledError ?? null}
					/>
				)}
			</div>
		</Card>
	);
}
