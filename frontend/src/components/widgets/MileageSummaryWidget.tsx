import { useMemo } from "react";
import { startOfMonth, endOfMonth, format } from "date-fns";
import { AlertCircle } from "lucide-react";
import { useMileageReportQuery } from "../../hooks/useReports";
import MileageSummaryCard from "../reports/MileageSummaryCard";
import Card from "../ui/Card";

export default function MileageSummaryWidget() {
	const now = useMemo(() => new Date(), []);
	const start = useMemo(() => startOfMonth(now).toISOString(), [now]);
	const end   = useMemo(() => endOfMonth(now).toISOString(),   [now]);
	const rangeLabel = useMemo(
		() => `${format(startOfMonth(now), "MMM d, yyyy")} - ${format(endOfMonth(now), "MMM d, yyyy")}`,
		[now]
	);

	const { data, isLoading, error } = useMileageReportQuery(start, end);

	if (error) return (
		<div className="flex items-center gap-2 p-4 bg-error/10 border border-error/20 rounded-lg h-full">
			<AlertCircle size={14} className="text-error-text shrink-0" />
			<p className="text-sm text-error-text">Failed to load mileage data</p>
		</div>
	);

	if (isLoading || !data) return <div className="bg-base border border-border-subtle rounded-xl h-full animate-pulse" />;

	return (
	<Card className="h-full">
		<MileageSummaryCard data={data} rangeLabel={rangeLabel} />
	</Card>
	);
}
