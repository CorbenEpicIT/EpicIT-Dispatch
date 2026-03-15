import {
	ComposedChart,
	Bar,
	XAxis,
	YAxis,
	Tooltip,
	LabelList,
	ResponsiveContainer,
	Cell,
} from "recharts";
import Card from "../ui/Card";
import { formatCurrency } from "../../util/util";
import type {
	QuotePipelineResponse,
	QuotePipelineBucket,
} from "../../types/reports";

interface QuotePipelineProps {
	data: QuotePipelineResponse;
}

interface BucketConfig {
	key: "draft" | "sent" | "viewed";
	label: string;
	color: string;
}

const BUCKETS: BucketConfig[] = [
	{ key: "draft", label: "Draft", color: "#3b82f6" },
	{ key: "sent", label: "Sent", color: "#10b981" },
	{ key: "viewed", label: "Viewed", color: "#06b6d4" },
];

function formatYAxisCurrency(value: number): string {
	if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
	if (value >= 1_000) return `$${(value / 1_000).toFixed(0)}k`;
	return `$${value}`;
}

function CustomTooltip({
	active,
	payload,
	label,
}: {
	active?: boolean;
	payload?: { dataKey: string; value: number; color: string }[];
	label?: string;
}) {
	if (!active || !payload?.length) return null;

	const valueEntry = payload.find((p) => p.dataKey === "value");
	const countEntry = payload.find((p) => p.dataKey === "count");

	return (
		<div className="rounded-lg px-3 py-2 bg-zinc-900/80 backdrop-blur-md shadow-lg">
			<p className="text-xs text-zinc-400 mb-1">{label}</p>
			{valueEntry && (
				<p className="text-sm font-semibold text-white">
					{formatCurrency(valueEntry.value)}
				</p>
			)}
			{countEntry && (
				<p className="text-xs text-zinc-400">
					{countEntry.value} {countEntry.value === 1 ? "quote" : "quotes"}
				</p>
			)}
		</div>
	);
}

export default function QuotePipeline({ data }: QuotePipelineProps) {
	const { totalRevenue, quoteCount } = data;

	const chartData = BUCKETS.map((b) => {
		const bucket: QuotePipelineBucket = data[b.key];
		return {
			status: b.label,
			value: bucket.revenue,
			count: bucket.count,
			color: b.color,
		};
	});

	return (
		<Card
			className="h-full"
			title="Open Quote Pipeline"
			headerAction={
				<span className="text-xs font-medium text-zinc-400 bg-zinc-800 px-2 py-1 rounded-full">
					{quoteCount} {quoteCount === 1 ? "Quote" : "Quotes"}
				</span>
			}
		>
			{/* Total Revenue for the Open Quotes */}
			<p className="text-xl font-bold text-white tracking-tight mb-3">
				{formatCurrency(totalRevenue)}
			</p>

			{/* Open Quote Pipepline Chart */}
			<div className="min-h-[200px]">
				<ResponsiveContainer width="100%" aspect={1} minWidth={0}>
				<ComposedChart
					data={chartData}
					margin={{ top: 8, right: 8, bottom: 0, left: 0 }}
					barCategoryGap="15%"
				>
					<XAxis
						dataKey="status"
						axisLine={false}
						tickLine={false}
						tick={{ fill: "#a1a1aa", fontSize: 12 }}
					/>
					<YAxis
						yAxisId="left"
						axisLine={false}
						tickLine={false}
						tick={{ fill: "#a1a1aa", fontSize: 11 }}
						tickFormatter={formatYAxisCurrency}
						tickCount={5}
						domain={[0, (dataMax: number) => Math.round(dataMax * 1.2)]}
						width={52}
						label={{
							value: "Total Value ($)",
							angle: -90,
							position: "insideLeft",
							fill: "#a1a1aa",
							fontSize: 10,
							dy: 40,
						}}
					/>
						<Tooltip
						content={<CustomTooltip />}
						cursor={false}
					/>
					<Bar
						yAxisId="left"
						dataKey="value"
						name="Value"
						radius={[6, 6, 0, 0]}
						maxBarSize={60}
					>
						{chartData.map((entry, index) => (
							<Cell key={index} fill={entry.color} />
						))}
						<LabelList
							dataKey="value"
							position="top"
							fill="#FFFFFF"
							fontSize={11}
							fontWeight={600}
							formatter={(val) => "$" + Number(val as number).toLocaleString()}
						/>
					</Bar>
					</ComposedChart>
			</ResponsiveContainer>
			</div>
		</Card>
	);
}
