import { PieChart, Pie, Tooltip, ResponsiveContainer } from "recharts";
import Card from "../ui/Card";

interface FirstTimeFixChartProps {
	firstTimeFix: number;
	repeatVisit: number;
}

const BG_COLOR = "var(--color-chart-hole-bg)";

interface Slice {
	label: string;
	count: number;
	fill: string;
}

function CustomTooltip({
	active,
	payload,
	total,
}: {
	active?: boolean;
	payload?: { name: string; value: number; payload: Slice }[];
	total: number;
}) {
	if (!active || !payload?.length) return null;
	const { name, value } = payload[0];
	const pct = total > 0 ? Math.round((value / total) * 100) : 0;
	return (
		<div className="rounded-lg px-3 py-2 bg-base/80 backdrop-blur-md shadow-lg">
			<p className="text-xs text-text-tertiary">{name}</p>
			<p className="text-sm font-semibold text-primary">
				{value} {value === 1 ? "job" : "jobs"}
			</p>
			<p className="text-xs text-text-tertiary">{pct}% of completed</p>
		</div>
	);
}

export default function FirstTimeFixChart({ firstTimeFix, repeatVisit }: FirstTimeFixChartProps) {
	const total = firstTimeFix + repeatVisit;
	const chartData: Slice[] = [
		{ label: "First-Time Fix", count: firstTimeFix, fill: "var(--color-chart-success)" },
		{ label: "Repeat Visit", count: repeatVisit, fill: "var(--color-chart-error)" },
	];

	return (
		<Card className="h-full" title="First-Time Fix vs. Repeat">
			{total === 0 ? (
				<div className="flex-1 min-h-0 flex items-center justify-center">
					<p className="text-sm text-text-muted">No completed jobs in this period</p>
				</div>
			) : (
				<>
					<div className="relative flex-1 min-h-0">
						<ResponsiveContainer width="100%" height="100%" minWidth={0}>
							<PieChart>
								<Pie
									data={chartData}
									dataKey="count"
									nameKey="label"
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
									content={<CustomTooltip total={total} />}
									cursor={false}
								/>
							</PieChart>
						</ResponsiveContainer>
					</div>

					<div className="flex flex-wrap items-center justify-center gap-4 pt-2 shrink-0">
						{chartData.map((entry) => (
							<div key={entry.label} className="flex items-center gap-2">
								<span
									className="inline-block w-3 h-3 rounded-full"
									style={{ backgroundColor: entry.fill }}
								/>
								<span className="text-sm text-text-tertiary">{entry.label}</span>
								<span className="text-sm font-medium text-primary">{entry.count}</span>
							</div>
						))}
					</div>
				</>
			)}
		</Card>
	);
}
