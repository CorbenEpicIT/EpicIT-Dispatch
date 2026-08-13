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
import type { RevenueByLineItemTypeRow } from "../../types/reports";

interface RevenueByLineItemTypeChartProps {
	data: RevenueByLineItemTypeRow[];
	total: number;
}

const TYPE_COLORS: Record<string, string> = {
	labor: "var(--color-chart-primary)",
	material: "var(--color-chart-success)",
	equipment: "var(--color-chart-info)",
	other: "var(--color-chart-warning)",
};

const FALLBACK_COLOR = "var(--color-chart-fallback)";

const formatAxisCurrency = (value: number) => {
	if (value >= 1000) return `$${(value / 1000).toFixed(1)}k`;
	return `$${value}`;
};

function CustomTooltip({
	active,
	payload,
}: {
	active?: boolean;
	payload?: { payload: RevenueByLineItemTypeRow }[];
}) {
	if (!active || !payload?.length) return null;
	const d = payload[0].payload;
	return (
		<div className="rounded-lg px-3 py-2 bg-base/90 backdrop-blur-md shadow-lg border border-border-subtle">
			<p className="text-xs text-text-tertiary">{d.label}</p>
			<p className="text-sm font-semibold text-primary">{formatCurrency(d.revenue)}</p>
			<p className="text-xs text-text-tertiary">
				{d.lineCount} line items · {d.pctOfTotal}% of total
			</p>
		</div>
	);
}

export default function RevenueByLineItemTypeChart({
	data,
	total,
}: RevenueByLineItemTypeChartProps) {
	return (
		<Card
			className="h-full"
			title="Revenue by Line Item Type"
			headerAction={
				<span className="text-xl font-bold text-primary">{formatCurrency(total)}</span>
			}
		>
			{total === 0 ? (
				<div className="flex-1 min-h-0 flex items-center justify-center">
					<p className="text-sm text-text-muted">No billed revenue in this period</p>
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
								dataKey="label"
								axisLine={false}
								tickLine={false}
								tick={{ fill: "var(--color-chart-axis)", fontSize: 12 }}
								width={90}
							/>
							<Tooltip content={<CustomTooltip />} cursor={false} />
							<Bar dataKey="revenue" radius={[0, 4, 4, 0]} maxBarSize={32}>
								{data.map((d) => (
									<Cell key={d.id} fill={TYPE_COLORS[d.id] || FALLBACK_COLOR} />
								))}
							</Bar>
						</BarChart>
					</ResponsiveContainer>
				</div>
			)}
		</Card>
	);
}
