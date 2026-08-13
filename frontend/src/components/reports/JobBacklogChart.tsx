import {
	BarChart,
	Bar,
	XAxis,
	YAxis,
	CartesianGrid,
	Tooltip,
	ResponsiveContainer,
} from "recharts";
import Card from "../ui/Card";
import { formatCurrency } from "../../util/util";
import { JobStatusLabels } from "../../types/jobs";
import type { JobBacklogResponse, JobBacklogStatusRow } from "../../types/reports";

const BUCKETS = [
	{ key: "fresh", label: "0-7 days", fill: "var(--color-chart-success)" },
	{ key: "aging", label: "7-30 days", fill: "var(--color-chart-warning)" },
	{ key: "stalled", label: "30+ days", fill: "var(--color-chart-error)" },
] as const;

// Compact currency 
const formatAxisCurrency = (value: number) => {
	if (value >= 1000000) return `$${(value / 1000000).toFixed(1)}M`;
	if (value >= 1000) return `$${(value / 1000).toFixed(0)}k`;
	return `$${value}`;
};

function BacklogTooltip({
	active,
	payload,
}: {
	active?: boolean;
	payload?: { payload: { row: JobBacklogStatusRow } }[];
}) {
	if (!active || !payload?.length) return null;
	const row = payload[0].payload.row;
	if (!row) return null;

	return (
		<div className="rounded-lg px-3 py-2 bg-base/90 backdrop-blur-md shadow-lg border border-border-subtle min-w-[11rem]">
			<p className="text-xs font-medium text-text-secondary mb-1.5">
				{JobStatusLabels[row.status]}
			</p>
			{BUCKETS.map((b) => (
				<div key={b.key} className="flex items-center justify-between gap-3 text-xs py-0.5">
					<span className="flex items-center gap-1.5">
						<span className="w-2 h-2 rounded-sm" style={{ background: b.fill }} />
						<span className="text-text-tertiary">{b.label}</span>
					</span>
					<span className="tabular-nums text-text-primary">
						{row[b.key].count} · {formatCurrency(row[b.key].revenue)}
					</span>
				</div>
			))}
			<div className="mt-1 pt-1 border-t border-border-subtle flex items-center justify-between gap-3 text-xs font-semibold">
				<span className="text-text-tertiary">Total</span>
				<span className="tabular-nums text-primary">
					{row.total.count} · {formatCurrency(row.total.revenue)}
				</span>
			</div>
		</div>
	);
}

interface JobBacklogChartProps {
	data: JobBacklogResponse;
}

export default function JobBacklogChart({ data }: JobBacklogChartProps) {
	const isEmpty = data.totals.total.count === 0;

	const chartData = data.statuses.map((s) => ({
		label: JobStatusLabels[s.status],
		fresh: s.fresh.revenue,
		aging: s.aging.revenue,
		stalled: s.stalled.revenue,
		row: s,
	}));

	return (
		<Card className="h-full" title="Job Backlog">
			{isEmpty ? (
				<div className="flex-1 min-h-0 flex items-center justify-center">
					<p className="text-sm text-text-muted">No open jobs</p>
				</div>
			) : (
				<div className="flex-1 min-h-0 flex flex-col">
					<div className="flex-1 min-h-0">
						<ResponsiveContainer width="100%" height="100%" minWidth={0}>
							<BarChart data={chartData} margin={{ top: 8, right: 8, bottom: 4, left: 8 }}>
								<CartesianGrid vertical={false} stroke="var(--color-border-subtle)" />
								<XAxis
									dataKey="label"
									axisLine={false}
									tickLine={false}
									tick={{ fill: "var(--color-chart-axis)", fontSize: 12 }}
								/>
								<YAxis
									axisLine={false}
									tickLine={false}
									tick={{ fill: "var(--color-chart-axis)", fontSize: 12 }}
									tickFormatter={formatAxisCurrency}
									width={56}
								/>
								<Tooltip
									content={<BacklogTooltip />}
									cursor={{ fill: "var(--color-surface)", opacity: 0.4 }}
								/>
								{BUCKETS.map((b, i) => (
									<Bar
										key={b.key}
										dataKey={b.key}
										stackId="backlog"
										fill={b.fill}
										maxBarSize={72}
										radius={i === BUCKETS.length - 1 ? [4, 4, 0, 0] : undefined}
									/>
								))}
							</BarChart>
						</ResponsiveContainer>
					</div>

					{/* Legend */}
					<div className="flex items-center justify-center gap-4 mt-2">
						{BUCKETS.map((b) => (
							<span key={b.key} className="flex items-center gap-1.5 text-xs text-text-tertiary">
								<span className="w-2.5 h-2.5 rounded-sm" style={{ background: b.fill }} />
								{b.label}
							</span>
						))}
					</div>

					<p className="text-xs text-center mt-1.5">
						<span className="font-semibold text-text-primary tabular-nums">
							{data.totals.total.count}
						</span>
						<span className="text-text-tertiary"> open · </span>
						<span className="font-semibold text-text-primary tabular-nums">
							{formatCurrency(data.totals.total.revenue)}
						</span>
						<span className="text-text-tertiary"> value</span>
					</p>
				</div>
			)}
		</Card>
	);
}
