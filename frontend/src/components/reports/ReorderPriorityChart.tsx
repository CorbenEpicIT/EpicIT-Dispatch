import { useMemo } from "react";
import {
	ScatterChart,
	Scatter,
	Cell,
	XAxis,
	YAxis,
	ZAxis,
	CartesianGrid,
	ReferenceLine,
	Tooltip,
	ResponsiveContainer,
} from "recharts";
import { format } from "date-fns";
import Card from "../ui/Card";
import type { ReorderForecastRow } from "../../types/reports";

interface ReorderPriorityChartProps {
	data: ReorderForecastRow[];
}

interface PriorityDatum {
	name: string;
	days: number;
	usage: number;
	qty: number;
	stockoutDate: string;
	unit: string | null;
	fill: string;
}

const severityFill = (days: number) => {
	if (days <= 7) return "var(--color-chart-error)";
	if (days <= 14) return "var(--color-orange)";
	return "var(--color-chart-warning)";
};

const fmtQty = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(2));

function CustomTooltip({
	active,
	payload,
}: {
	active?: boolean;
	payload?: { payload: PriorityDatum }[];
}) {
	if (!active || !payload?.length) return null;
	const d = payload[0].payload;
	if (!d?.name) return null;

	return (
		<div className="rounded-lg px-3 py-2 bg-base/90 backdrop-blur-md shadow-lg border border-border-subtle">
			<p className="text-sm font-semibold text-text-primary">{d.name}</p>
			<p className="text-sm font-semibold text-primary">
				Out by {format(new Date(d.stockoutDate), "MMM d, yyyy")}
			</p>
			<p className="text-xs text-text-tertiary">
				{d.days} {d.days === 1 ? "day" : "days"} of stock
			</p>
			<p className="text-xs text-text-tertiary">
				{fmtQty(d.qty)}
				{d.unit ? ` ${d.unit}` : ""} on hand · {d.usage.toFixed(2)}/day
			</p>
		</div>
	);
}

export default function ReorderPriorityChart({ data }: ReorderPriorityChartProps) {
	const chartData: PriorityDatum[] = useMemo(() => {
		return data
			.filter(
				(r) =>
					r.daysOfStock != null &&
					r.projectedStockoutDate != null &&
					r.avgDailyUsage > 0,
			)
			.map((r) => {
				const days = Math.round(r.daysOfStock as number);
				return {
					name: r.itemName,
					days,
					usage: r.avgDailyUsage,
					qty: r.currentQuantity,
					stockoutDate: r.projectedStockoutDate as string,
					unit: r.unit,
					fill: severityFill(days),
				};
			})
			.filter((d) => d.days <= 30);
	}, [data]);

	const isEmpty = chartData.length === 0;

	return (
		<Card
			className="h-full"
			title="Reorder Priority"
			headerAction={
				!isEmpty ? (
					<span className="text-sm font-medium text-text-tertiary">
						{chartData.length} at risk
					</span>
				) : undefined
			}
		>
			{isEmpty ? (
				<div className="flex-1 min-h-0 flex items-center justify-center">
					<p className="text-sm text-text-muted">
						No items projected to stock out within 30 days
					</p>
				</div>
			) : (
				<div className="flex-1 min-h-0">
					<ResponsiveContainer width="100%" height="100%" minWidth={0}>
						<ScatterChart margin={{ top: 12, right: 20, bottom: 24, left: 12 }}>
							<CartesianGrid stroke="var(--color-border-subtle)" />
							<XAxis
								type="number"
								dataKey="days"
								name="Days until stockout"
								axisLine={false}
								tickLine={false}
								tick={{ fill: "var(--color-chart-axis)", fontSize: 12 }}
								tickFormatter={(v: number) => `${v}d`}
								label={{
									value: "Days until stockout",
									position: "insideBottom",
									offset: -12,
									fill: "var(--color-chart-axis)",
									fontSize: 12,
								}}
							/>
							<YAxis
								type="number"
								dataKey="usage"
								name="Avg daily usage"
								axisLine={false}
								tickLine={false}
								tick={{ fill: "var(--color-chart-axis)", fontSize: 12 }}
								width={48}
								label={{
									value: "Avg daily usage",
									angle: -90,
									position: "insideLeft",
									fill: "var(--color-chart-axis)",
									fontSize: 12,
									style: { textAnchor: "middle" },
								}}
							/>
							<ZAxis
								type="number"
								dataKey="qty"
								range={[80, 500]}
								name="On hand"
							/>
							<ReferenceLine
								x={14}
								stroke="var(--color-border)"
								strokeDasharray="4 4"
							/>
							<Tooltip content={<CustomTooltip />} cursor={false} />
							<Scatter data={chartData} fillOpacity={0.75}>
								{chartData.map((d) => (
									<Cell key={d.name} fill={d.fill} />
								))}
							</Scatter>
						</ScatterChart>
					</ResponsiveContainer>
				</div>
			)}
		</Card>
	);
}
