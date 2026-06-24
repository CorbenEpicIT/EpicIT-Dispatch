import { PieChart, Pie, Tooltip, ResponsiveContainer } from "recharts";
import Card from "../ui/Card";
import type { LeadsBySourceItem } from "../../types/reports";

interface LeadsBySourceChartProps {
	data: LeadsBySourceItem[];
	total: number;
}

const BG_COLOR = "var(--color-chart-hole-bg)";

const CHART_PALETTE = [
	"var(--color-chart-primary)",
	"var(--color-chart-success)",
	"var(--color-chart-info)",
	"var(--color-chart-warning)",
	"var(--color-chart-error)",
];

const formatCount = (n: number) => `${n} ${n === 1 ? "lead" : "leads"}`;

function CustomTooltip({
	active,
	payload,
}: {
	active?: boolean;
	payload?: { name: string; value: number; payload: LeadsBySourceItem }[];
}) {
	if (!active || !payload?.length) return null;
	const { name, value } = payload[0];
	return (
		<div className="rounded-lg px-3 py-2 bg-base/80 backdrop-blur-md shadow-lg">
			<p className="text-xs text-text-tertiary">{name}</p>
			<p className="text-sm font-semibold text-primary">
				{formatCount(value)}
			</p>
		</div>
	);
}

export default function LeadsBySourceChart({
	data,
	total,
}: LeadsBySourceChartProps) {
	const chartData = data.map((entry, i) => ({
		...entry,
		fill: CHART_PALETTE[i % CHART_PALETTE.length],
	}));
	return (
		<Card
			className="h-full"
			title="Leads by Source"
			headerAction={
				<span className="text-xl font-bold text-primary">
					{total.toLocaleString()}
				</span>
			}
		>
			<div className="relative flex-1 min-h-0">
				{/* Center label */}
				<div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
					<div className="text-center">
						<p className="text-xs uppercase tracking-wider text-text-tertiary">
							Leads
						</p>
						<p className="text-xl font-bold text-primary">
							{total.toLocaleString()}
						</p>
					</div>
				</div>

				<ResponsiveContainer width="100%" height="100%" minWidth={0}>
					<PieChart>
						<Pie
							data={chartData}
							dataKey="count"
							nameKey="source"
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
			<div className="flex flex-wrap items-center justify-center gap-4 pt-2 shrink-0">
				{chartData.map((entry) => (
					<div
						key={entry.source}
						className="flex items-center gap-2"
					>
						<span
							className="inline-block w-3 h-3 rounded-full"
							style={{ backgroundColor: entry.fill }}
						/>
						<span className="text-sm text-text-tertiary">
							{entry.source}
						</span>
						<span className="text-sm font-medium text-primary">
							{entry.count.toLocaleString()}
						</span>
					</div>
				))}
			</div>
		</Card>
	);
}
