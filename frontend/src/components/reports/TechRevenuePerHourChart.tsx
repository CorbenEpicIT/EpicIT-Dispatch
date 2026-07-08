import {
	BarChart,
	Bar,
	Cell,
	XAxis,
	YAxis,
	CartesianGrid,
	Tooltip,
	ResponsiveContainer,
} from "recharts";
import Card from "../ui/Card";
import { formatCurrency } from "../../util/util";

export interface TechRevenuePerHourDatum {
	techName: string;
	revenuePerHour: number;
	revenue: number;
	hours: number;
}

interface TechRevenuePerHourChartProps {
	data: TechRevenuePerHourDatum[];
}

const CHART_PALETTE = [
	"var(--color-chart-primary)",
	"var(--color-chart-success)",
	"var(--color-chart-info)",
	"var(--color-chart-warning)",
	"var(--color-chart-error)",
];

const formatAxisCurrency = (value: number) => {
	if (value >= 1000) return `$${(value / 1000).toFixed(1)}k`;
	return `$${value}`;
};

function CustomTooltip({
	active,
	payload,
}: {
	active?: boolean;
	payload?: { payload: TechRevenuePerHourDatum }[];
}) {
	if (!active || !payload?.length) return null;
	const d = payload[0].payload;
	return (
		<div className="rounded-lg px-3 py-2 bg-base/90 backdrop-blur-md shadow-lg border border-border-subtle">
			<p className="text-xs text-text-tertiary">{d.techName}</p>
			<p className="text-sm font-semibold text-primary">
				{formatCurrency(d.revenuePerHour)} / hr
			</p>
			<p className="text-xs text-text-tertiary">
				{formatCurrency(d.revenue)} over {d.hours.toFixed(1)} hrs
			</p>
		</div>
	);
}

export default function TechRevenuePerHourChart({ data }: TechRevenuePerHourChartProps) {
	return (
		<Card className="h-full" title="Revenue per Hour by Technician">
			{data.length === 0 ? (
				<div className="flex-1 min-h-0 flex items-center justify-center">
					<p className="text-sm text-text-muted">No completed visits in this period</p>
				</div>
			) : (
				<div className="flex-1 min-h-0">
					<ResponsiveContainer width="100%" height="100%" minWidth={0}>
						<BarChart
							data={data}
							layout="vertical"
							margin={{ top: 8, right: 16, bottom: 4, left: 8 }}
						>
							<CartesianGrid horizontal={false} stroke="var(--color-border-subtle)" />
							<XAxis
								type="number"
								axisLine={false}
								tickLine={false}
								tick={{ fill: "var(--color-chart-axis)", fontSize: 12 }}
								tickFormatter={formatAxisCurrency}
							/>
							<YAxis
								type="category"
								dataKey="techName"
								axisLine={false}
								tickLine={false}
								tick={{ fill: "var(--color-chart-axis)", fontSize: 12 }}
								width={110}
							/>
							<Tooltip content={<CustomTooltip />} cursor={false} />
							<Bar dataKey="revenuePerHour" radius={[0, 4, 4, 0]} maxBarSize={22}>
								{data.map((d, i) => (
									<Cell
										key={d.techName}
										fill={CHART_PALETTE[i % CHART_PALETTE.length]}
									/>
								))}
							</Bar>
						</BarChart>
					</ResponsiveContainer>
				</div>
			)}
		</Card>
	);
}
