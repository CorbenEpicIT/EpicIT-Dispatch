import { useMemo } from "react";
import {
	AreaChart,
	Area,
	XAxis,
	YAxis,
	Tooltip,
	Legend,
	ResponsiveContainer,
} from "recharts";
import { formatCurrency } from "../../util/util";
import type { RevenueMonthData } from "../../types/reports";

interface RevenueYTDChartProps {
	data: RevenueMonthData[];
	total: number;
	year: number;
}

interface ChartDataPoint {
	month: string;
	actual: number | null;
	forecast: number | null;
}

const MONTHS = [
	"Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

const formatYAxis = (value: number) => {
	if (value >= 1000000) return `$${(value / 1000000).toFixed(1)}M`;
	if (value >= 1000) return `$${(value / 1000).toFixed(0)}k`;
	return `$${value}`;
};

function CustomTooltip({
	active,
	payload,
	label,
}: {
	active?: boolean;
	payload?: { dataKey: string; value: number | null; name: string }[];
	label?: string;
}) {
	if (!active || !payload?.length) return null;

	const actual = payload.find((p) => p.dataKey === "actual");
	const forecast = payload.find((p) => p.dataKey === "forecast");
	const hasActual = actual?.value != null;

	return (
		<div className="rounded-lg px-3 py-2 bg-zinc-900/80 backdrop-blur-md shadow-lg">
			<p className="text-xs text-zinc-400 mb-1">{label}</p>
			{hasActual && (
				<p className="text-sm font-semibold text-white">
					Actuals: {formatCurrency(actual.value!)}
				</p>
			)}
			{!hasActual && forecast?.value != null && (
				<p className="text-sm font-semibold text-white">
					Forecast: {formatCurrency(forecast.value)}
				</p>
			)}
		</div>
	);
}

export default function RevenueYTDChart({
	data,
	total,
	year,
}: RevenueYTDChartProps) {
	const chartData = useMemo<ChartDataPoint[]>(() => {
		const now = new Date();
		const currentMonthIndex =
			now.getFullYear() === year ? now.getMonth() : -1;

		const points: ChartDataPoint[] = data.map((d) => {
			const monthIndex = MONTHS.indexOf(d.month);

			if (monthIndex < currentMonthIndex) {
				return { month: d.month, actual: d.currentYear || null, forecast: null };
			}

			if (monthIndex === currentMonthIndex) {
				return { month: d.month, actual: d.currentYear || null, forecast: null };
			}

			return { month: d.month, actual: null, forecast: d.forecast || null };
		});

		let transitionIndex = -1;
		for (let i = points.length - 1; i >= 0; i--) {
			if (points[i].actual != null) {
				transitionIndex = i;
				break;
			}
		}
		if (transitionIndex >= 0) {
			points[transitionIndex].forecast = points[transitionIndex].actual;
		}

		return points;
	}, [data, year]);

	return (
		<div className="flex flex-col h-full">
			<div className="flex items-center justify-between mb-4">
				<h3 className="font-semibold text-white">
					Revenue Year to Date
				</h3>
				<span className="text-2xl font-bold text-white">
					{formatCurrency(total)}
				</span>
			</div>
			<div className="flex-1 min-h-0">
				<ResponsiveContainer width="100%" aspect={3} minWidth={0}>
					<AreaChart
						data={chartData}
						margin={{ top: 10, right: 10, left: 10, bottom: 0 }}
					>
						<defs>
							<linearGradient id="actualsFill" x1="0" y1="0" x2="0" y2="1">
								<stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
								<stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
							</linearGradient>
							<linearGradient id="forecastFill" x1="0" y1="0" x2="0" y2="1">
								<stop offset="5%" stopColor="#3b82f6" stopOpacity={0.1} />
								<stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
							</linearGradient>
						</defs>
						<XAxis
							dataKey="month"
							axisLine={false}
							tickLine={false}
							tick={{ fill: "#a1a1aa", fontSize: 12 }}
						/>
						<YAxis
							axisLine={false}
							tickLine={false}
							tick={{ fill: "#a1a1aa", fontSize: 12 }}
							tickFormatter={formatYAxis}
							width={60}
						/>
						<Tooltip
							content={<CustomTooltip />}
							cursor={false}
						/>
						<Legend
							wrapperStyle={{ color: "#a1a1aa", fontSize: 12 }}
						/>
						<Area
							type="monotone"
							dataKey="actual"
							name="Actuals"
							stroke="#3b82f6"
							strokeWidth={2}
							fill="url(#actualsFill)"
							dot={false}
							connectNulls={false}
						/>
						<Area
							type="monotone"
							dataKey="forecast"
							name="Forecast"
							stroke="#3b82f6"
							strokeWidth={2}
							strokeDasharray="5 5"
							fill="url(#forecastFill)"
							dot={false}
							connectNulls={false}
						/>
					</AreaChart>
				</ResponsiveContainer>
			</div>
		</div>
	);
}
