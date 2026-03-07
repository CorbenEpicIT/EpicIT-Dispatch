import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from "recharts";
import Card from "../ui/Card";
import type { ArrivalPerformanceResponse } from "../../types/reports";

interface ArrivalPerformanceChartProps {
	data: ArrivalPerformanceResponse;
	rangeLabel: string;
}

const COLORS = {
	Early: "#22c55e",
	"On-Time": "#3b82f6",
	Late: "#ef4444",
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
		return [{ name: "No Data", value: 1, pct: 0, color: "#27272a" }];
	}

	const pct = (n: number) =>
		data.total > 0 ? Math.round((n / data.total) * 100) : 0;

	return [
		{ name: "Early", value: data.early, pct: pct(data.early), color: COLORS.Early },
		{ name: "On-Time", value: data.onTime, pct: data.onTimeRate, color: COLORS["On-Time"] },
		{ name: "Late", value: data.late, pct: pct(data.late), color: COLORS.Late },
	];
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
		<div className="rounded-lg px-3 py-2 bg-zinc-900/90 backdrop-blur-md shadow-lg border border-zinc-800">
			<p className="text-xs text-zinc-400">{d.name}</p>
			<p className="text-sm font-semibold text-white">{d.value} visits</p>
			<p className="text-xs text-zinc-400">{d.pct}% of total</p>
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
				<p className="text-xs font-medium text-zinc-400">{rangeLabel}</p>
			}
		>
			{/* Circle chart */}
			<div className="relative">
				<ResponsiveContainer width="100%" height={168}>
					<PieChart margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
						<Pie
							data={slices}
							startAngle={180}
							endAngle={0}
							cx="50%"
							cy="100%"
							outerRadius={145}
							innerRadius={95}
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

				{/* On-time rate is shown in the middle of the chart */}
				<div className="absolute bottom-3 left-0 right-0 flex flex-col items-center pointer-events-none">
					{data.total > 0 ? (
						<>
							<p className="text-3xl font-bold text-white leading-none">
								{data.onTimeRate}%
							</p>
							<p className="text-xs text-zinc-500 mt-1">on-time rate</p>
						</>
					) : (
						<p className="text-xs text-zinc-500">No data</p>
					)}
				</div>
			</div>

			{/* Information about the metrics for the user */}
			<div className="grid grid-cols-3 gap-2 mt-5 px-1">
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
						<span className="text-xs font-medium text-zinc-300">{label}</span>
						<span className="text-[10px] text-zinc-600">{sub}</span>
					</div>
				))}
			</div>

			<p className="text-center text-[11px] text-zinc-600 mt-3">
				{data.total} visits with recorded arrival
			</p>
		</Card>
	);
}
