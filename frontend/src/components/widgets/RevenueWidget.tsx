import { useRevenueYTDQuery, useUnscheduledRevenueQuery } from "../../hooks/useReports";
import RevenueOverviewSection from "../reports/RevenueOverviewSection";
import Card from "../ui/Card";

export default function RevenueWidget() {
	const { data: revenueYTD, isLoading: revenueLoading, error: revenueError } = useRevenueYTDQuery();
	const { data: unscheduledRevenue, isLoading: unscheduledLoading, error: unscheduledError } = useUnscheduledRevenueQuery();

	return (
		<Card className="h-full">
			<div className="flex-1 flex items-center w-full">
				<RevenueOverviewSection
					revenueYTD={revenueYTD}
					revenueLoading={revenueLoading}
					revenueError={revenueError ?? null}
					unscheduledRevenue={unscheduledRevenue}
					unscheduledRevenueLoading={unscheduledLoading}
					unscheduledRevenueError={unscheduledError ?? null}
				/>
			</div>
		</Card>
	);
}
