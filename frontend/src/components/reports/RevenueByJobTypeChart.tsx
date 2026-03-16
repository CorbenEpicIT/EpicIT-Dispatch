import { PieChart, Pie, Tooltip, ResponsiveContainer } from "recharts";
import Card from "../ui/Card";
import { formatCurrency } from "../../util/util";
import type { RevenueByJobTypeItem } from "../../types/reports";

interface RevenueByJobTypeChartProps {
	data: RevenueByJobTypeItem[];
	total: number;
}

const BG_COLOR = "#121212";

const TYPE_COLORS: Record<string, string> = {
	"One-Time": "#3b82f6",
	Recurring: "#10b981",
};

const FALLBACK_COLOR = "#3f3f46";

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
		<div className="rounded-lg px-3 py-2 bg-zinc-900/80 backdrop-blur-md shadow-lg">
			<p className="text-xs text-zinc-400">{name}</p>
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
						<p className="text-xs uppercase tracking-wider text-zinc-400">
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
						<span className="text-sm text-zinc-400">
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
