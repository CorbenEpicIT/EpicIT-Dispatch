import { PieChart, Pie, Tooltip, ResponsiveContainer } from "recharts";
import Card from "../ui/Card";
import { formatCurrency } from "../../util/util";
import type { RevenueByJobTypeItem } from "../../types/reports";

interface RevenueByJobTypeChartProps {
	data: RevenueByJobTypeItem[];
	total: number;
}

const BG_COLOR = "var(--color-chart-hole-bg)";

const TYPE_COLORS: Record<string, string> = {
	"One-Time": "var(--color-chart-primary)",
	Recurring: "var(--color-chart-success)",
};

const FALLBACK_COLOR = "var(--color-chart-fallback)";

function CustomTooltip({
	active,
	payload,
}: {
	active?: boolean;
	payload?: { name: string; value: number; payload: RevenueByJobTypeItem }[];
}) {
	if (!active || !payload?.length) return null;
	const { name, value } = payload[0];
	return (
		<div className="rounded-lg px-3 py-2 bg-base/80 backdrop-blur-md shadow-lg">
			<p className="text-xs text-text-tertiary">{name}</p>
			<p className="text-sm font-semibold text-white">
				{formatCurrency(value)}
			</p>
		</div>
	);
}

export default function RevenueByJobTypeChart({
	data,
	total,
}: RevenueByJobTypeChartProps) {
	const chartData = data.map((entry) => ({
		...entry,
		fill: TYPE_COLORS[entry.type] || FALLBACK_COLOR,
	}));
	return (
		<Card
			className="h-full"
			title="Revenue by Job Type"
			headerAction={
				<span className="text-xl font-bold text-white">
					{formatCurrency(total)}
				</span>
			}
		>
			<div className="relative">
				{/* Center label */}
				<div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
					<div className="text-center">
						<p className="text-xs uppercase tracking-wider text-text-tertiary">
							Total
						</p>
						<p className="text-xl font-bold text-white">
							{formatCurrency(total)}
						</p>
					</div>
				</div>

				<ResponsiveContainer width="100%" aspect={1} minWidth={0}>
					<PieChart>
						<Pie
							data={chartData}
							dataKey="revenue"
							nameKey="type"
							cx="50%"
							cy="50%"
							outerRadius="90%"
							innerRadius="72%"
							paddingAngle={5}
							stroke={BG_COLOR}
							strokeWidth={3}
							label={false}
						/>
						<Tooltip
							content={<CustomTooltip />}
							cursor={false}
						/>
					</PieChart>
				</ResponsiveContainer>
			</div>

			{/* Legend for the user to see */}
			<div className="flex items-center justify-center gap-4 pt-2">
				{data.map((entry) => (
					<div
						key={entry.type}
						className="flex items-center gap-2"
					>
						<span
							className="inline-block w-3 h-3 rounded-full"
							style={{
								backgroundColor:
									TYPE_COLORS[entry.type] || FALLBACK_COLOR,
							}}
						/>
						<span className="text-sm text-text-tertiary">
							{entry.type}
						</span>
						<span className="text-sm font-medium text-white">
							{formatCurrency(entry.revenue)}
						</span>
					</div>
				))}
			</div>
		</Card>
	);
}
