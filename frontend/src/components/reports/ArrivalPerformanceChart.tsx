import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from "recharts";
import Card from "../ui/Card";
import type { ArrivalPerformanceResponse } from "../../types/reports";

interface ArrivalPerformanceChartProps {
	data: ArrivalPerformanceResponse;
	rangeLabel: string;
}

const COLORS = {
	Early: "var(--color-success)",
	"On-Time": "var(--color-chart-primary)",
	Late: "var(--color-error)",
} as const;

type SliceName = keyof typeof COLORS;

interface Slice {
	name: SliceName | "No Data";
	value: number;
	pct: number;
	color: string;
}

function buildSlices(data: ArrivalPerformanceResponse): Slice[] {
	if (data.total === 0) {
		return [{ name: "No Data", value: 1, pct: 0, color: "var(--color-chart-fallback)" }];
	}

	const pct = (n: number) =>
		data.total > 0 ? Math.round((n / data.total) * 100) : 0;

	return ([
		{ name: "Early" as const, value: data.early, pct: pct(data.early), color: COLORS.Early },
		{ name: "On-Time" as const, value: data.onTime, pct: pct(data.onTime), color: COLORS["On-Time"] },
		{ name: "Late" as const, value: data.late, pct: pct(data.late), color: COLORS.Late },
	] satisfies Slice[]).filter(s => s.value > 0);
}

function CustomTooltip({
	active,
	payload,
}: {
	active?: boolean;
	payload?: { payload: Slice }[];
}) {
	if (!active || !payload?.length) return null;
	const d = payload[0].payload;
	if (d.name === "No Data") return null;

	return (
		<div className="rounded-lg px-3 py-2 bg-base/90 backdrop-blur-md shadow-lg border border-border-subtle">
			<p className="text-xs text-text-tertiary">{d.name}</p>
			<p className="text-sm font-semibold text-primary">{d.value} visits</p>
			<p className="text-xs text-text-tertiary">{d.pct}% of total</p>
		</div>
	);
}

export default function ArrivalPerformanceChart({
	data,
	rangeLabel,
}: ArrivalPerformanceChartProps) {
	const slices = buildSlices(data);

	return (
		<Card
			className="h-full"
			title="On-Time Arrival Performance"
			headerAction={
				<p className="text-xs font-medium text-text-tertiary">{rangeLabel}</p>
			}
		>
			{/* Circle chart */}
			<div className="flex-1 min-h-0">
				<ResponsiveContainer width="100%" height="100%" minWidth={0}>
					<PieChart margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
						<Pie
							data={slices}
							startAngle={180}
							endAngle={0}
							cx="50%"
							cy="75%"
							outerRadius="100%"
							innerRadius="65%"
							dataKey="value"
							stroke="none"
							paddingAngle={data.total > 0 ? 2 : 0}
						>
							{slices.map((slice) => (
								<Cell key={slice.name} fill={slice.color} />
							))}
						</Pie>
						<Tooltip
							content={<CustomTooltip />}
							cursor={false}
						/>
					</PieChart>
				</ResponsiveContainer>
			</div>

			{/* Information about the metrics for the user */}
			<div className="grid grid-cols-3 gap-2 mt-3 px-1 shrink-0">
				{(
					[
						{ label: "Early", value: data.early, color: COLORS.Early, sub: "≥15 min early" },
						{ label: "On-Time", value: data.onTime, color: COLORS["On-Time"], sub: "within window" },
						{ label: "Late", value: data.late, color: COLORS.Late, sub: ">30 min late" },
					] as const
				).map(({ label, value, color, sub }) => (
					<div key={label} className="flex flex-col items-center gap-0.5">
						<span
							className="text-xl font-bold leading-none"
							style={{ color }}
						>
							{value}
						</span>
						<span className="text-xs font-medium text-text-secondary">{label}</span>
						<span className="text-[10px] text-text-faint">{sub}</span>
					</div>
				))}
			</div>

			{/* On-time rate percentage below early,late, on-time */}
			<div className="flex flex-col items-center mt-3 shrink-0">
				{data.total > 0 ? (
					<>
						<p className="text-2xl font-bold text-primary leading-none">{data.onTimeRate}%</p>
						<p className="text-xs text-text-muted mt-1">on-time rate</p>
					</>
				) : (
					<p className="text-xs text-text-muted">No data</p>
				)}
			</div>

			<p className="text-center text-[11px] text-text-faint mt-2 shrink-0">
				{data.total} visits with recorded arrival
			</p>
		</Card>
	);
}
