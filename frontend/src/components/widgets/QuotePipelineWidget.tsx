import { useMemo } from "react";
import { startOfMonth, endOfMonth } from "date-fns";
import { AlertCircle } from "lucide-react";
import { useQuotePipelineQuery } from "../../hooks/useReports";
import QuotePipeline from "../reports/QuotePipeline";

export default function QuotePipelineWidget() {
	const now = useMemo(() => new Date(), []);
	const start = useMemo(() => startOfMonth(now).toISOString(), [now]);
	const end   = useMemo(() => endOfMonth(now).toISOString(),   [now]);

	const { data, isLoading, error } = useQuotePipelineQuery(start, end);

	if (error) return (
		<div className="flex items-center gap-2 p-4 bg-error/10 border border-error/20 rounded-lg h-full">
			<AlertCircle size={14} className="text-error-text shrink-0" />
			<p className="text-sm text-error-text">Failed to load quote pipeline</p>
		</div>
	);

	if (isLoading || !data) return <div className="bg-base border border-border-subtle rounded-xl h-full animate-pulse" />;

	return <div className="h-full"><QuotePipeline data={data} /></div>;
}
