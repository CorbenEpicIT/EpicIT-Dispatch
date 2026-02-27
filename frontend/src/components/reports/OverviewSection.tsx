import { format } from "date-fns";
import type { OverviewResponse } from "../../types/reports";
import OverviewCard from "./OverviewCard";
import { formatCurrency } from "../../util/util";

interface OverviewSectionProps {
	data: OverviewResponse;
}

function buildTooltip(
	currentValue: number,
	previousValue: number,
	currentLabel: string,
	previousLabel: string,
	formatter: (v: number) => string
) {
	return {
		currentLabel,
		previousLabel,
		currentDisplay: formatter(currentValue),
		previousDisplay: formatter(previousValue),
	};
}

export default function OverviewSection({ data }: OverviewSectionProps) {
	const fmtDate = (iso: string) => format(new Date(iso), "MMM d, yyyy");

	const currentLabel = `${fmtDate(data.periodStart)} – ${fmtDate(data.periodEnd)}`;
	const previousLabel = `${fmtDate(data.previousPeriodStart)} – ${fmtDate(data.previousPeriodEnd)}`;

	return (
		<div>
			<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
				<OverviewCard
					label="Gross Revenue"
					value={data.grossRevenue.value}
					valueDisplay={formatCurrency(data.grossRevenue.value)}
					changePercent={data.grossRevenue.changePercent}
					tooltip={buildTooltip(data.grossRevenue.value, data.grossRevenue.previousValue, currentLabel, previousLabel, formatCurrency)}
				/>
				<OverviewCard
					label="Avg Job Size"
					value={data.avgJobValue.value}
					valueDisplay={formatCurrency(data.avgJobValue.value)}
					changePercent={data.avgJobValue.changePercent}
					tooltip={buildTooltip(data.avgJobValue.value, data.avgJobValue.previousValue, currentLabel, previousLabel, formatCurrency)}
				/>
				<OverviewCard
					label="Quote Conversion Rate"
					value={data.conversionRate.value}
					valueSuffix="%"
					changePercent={data.conversionRate.changePercent}
					tooltip={buildTooltip(data.conversionRate.value, data.conversionRate.previousValue, currentLabel, previousLabel, (v) => `${v}%`)}
				/>
				<OverviewCard
					label="Avg Time to Quote"
					value={data.avgResponseTime?.value ?? 0}
					valueSuffix="d"
					changePercent={data.avgResponseTime?.changePercent ?? 0}
					tooltip={buildTooltip(data.avgResponseTime?.value ?? 0, data.avgResponseTime?.previousValue ?? 0, currentLabel, previousLabel, (v) => `${v}d`)}
				/>
			</div>
		</div>
	);
}
