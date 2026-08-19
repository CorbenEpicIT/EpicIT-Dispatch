import {
	AreaChart,
	Area,
	XAxis,
	YAxis,
	CartesianGrid,
	Tooltip,
	ResponsiveContainer,
} from "recharts";
import Card from "../ui/Card";
import { formatCurrency } from "../../util/util";
import type { RecurringRevenueTrendPoint } from "../../types/reports";

interface RecurringRevenueTrendChartProps {
	data: RecurringRevenueTrendPoint[];
}

const formatAxisCurrency = (value: number) => {
	if (value >= 1000000) return `$${(value / 1000000).toFixed(1)}M`;
	if (value >= 1000) return `$${(value / 1000).toFixed(0)}k`;
	return `$${value}`;
};


const monthShort = (key: string) => {
	const [y, m] = key.split("-").map(Number);
	return new Date(y, m - 1, 1).toLocaleString("en-US", { month: "short" });
};
const monthLong = (key: string) => {
	const [y, m] = key.split("-").map(Number);
	return new Date(y, m - 1, 1).toLocaleString("en-US", { month: "short", year: "numeric" });
};

function TrendTooltip({
	active,
	payload,
}: {
	active?: boolean;
	payload?: { payload: RecurringRevenueTrendPoint }[];
}) {
	if (!active || !payload?.length) return null;
	const d = payload[0].payload;
	return (
		<div className="rounded-lg px-3 py-2 bg-base/90 backdrop-blur-md shadow-lg border border-border-subtle">
			<p className="text-xs text-text-tertiary">{monthLong(d.month)}</p>
			<p className="text-sm font-semibold text-primary">{formatCurrency(d.revenue)}</p>
		</div>
	);
}

export default function RecurringRevenueTrendChart({ data }: RecurringRevenueTrendChartProps) {
	const total = data.reduce((s, d) => s + d.revenue, 0);

	return (
		<Card
			className="h-full"
			title="Recurring Revenue"
			headerAction={<span className="text-xl font-bold text-primary">{formatCurrency(total)}</span>}
		>
			{total === 0 ? (
				<div className="flex-1 min-h-0 flex items-center justify-center">
					<p className="text-sm text-text-muted">No recurring revenue invoiced yet</p>
				</div>
			) : (
				<div className="flex-1 min-h-0">
					<ResponsiveContainer width="100%" height="100%" minWidth={0}>
						<AreaChart data={data} margin={{ top: 8, right: 12, bottom: 4, left: 8 }}>
							<defs>
								<linearGradient id="recurringRevenueFill" x1="0" y1="0" x2="0" y2="1">
									<stop offset="0%" stopColor="var(--color-chart-primary)" stopOpacity={0.35} />
									<stop offset="100%" stopColor="var(--color-chart-primary)" stopOpacity={0.02} />
								</linearGradient>
							</defs>
							<CartesianGrid vertical={false} stroke="var(--color-border-subtle)" />
							<XAxis
								dataKey="month"
								tickFormatter={monthShort}
								axisLine={false}
								tickLine={false}
								tick={{ fill: "var(--color-chart-axis)", fontSize: 12 }}
							/>
							<YAxis
								axisLine={false}
								tickLine={false}
								tick={{ fill: "var(--color-chart-axis)", fontSize: 12 }}
								tickFormatter={formatAxisCurrency}
								width={56}
							/>
							<Tooltip content={<TrendTooltip />} cursor={{ stroke: "var(--color-chart-axis)" }} />
							<Area
								type="monotone"
								dataKey="revenue"
								stroke="var(--color-chart-primary)"
								strokeWidth={2}
								fill="url(#recurringRevenueFill)"
								dot={false}
								activeDot={{ r: 4 }}
							/>
						</AreaChart>
					</ResponsiveContainer>
				</div>
			)}
		</Card>
	);
}
