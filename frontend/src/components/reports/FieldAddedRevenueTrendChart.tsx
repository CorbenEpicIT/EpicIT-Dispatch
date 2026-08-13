import { useMemo, useState } from "react";
import {
	AreaChart,
	Area,
	XAxis,
	YAxis,
	CartesianGrid,
	Tooltip,
	ResponsiveContainer,
} from "recharts";
import Card from "../ui/Card";
import { DropdownFilter } from "../ui/StatusFilter";
import { formatCurrency } from "../../util/util";
import type { FieldAddedRevenueTrend } from "../../types/reports";

interface FieldAddedRevenueTrendChartProps {
	trend: FieldAddedRevenueTrend;
}

const formatAxisCurrency = (value: number) => {
	if (value >= 1000000) return `$${(value / 1000000).toFixed(1)}M`;
	if (value >= 1000) return `$${(value / 1000).toFixed(0)}k`;
	return `$${value}`;
};

const monthShort = (key: string) => {
	const [y, m] = key.split("-").map(Number);
	return new Date(y, m - 1, 1).toLocaleString("en-US", { month: "short" });
};
const monthLong = (key: string) => {
	const [y, m] = key.split("-").map(Number);
	return new Date(y, m - 1, 1).toLocaleString("en-US", { month: "short", year: "numeric" });
};

type Point = { month: string; revenue: number };

function TrendTooltip({ active, payload }: { active?: boolean; payload?: { payload: Point }[] }) {
	if (!active || !payload?.length) return null;
	const d = payload[0].payload;
	return (
		<div className="rounded-lg px-3 py-2 bg-base/90 backdrop-blur-md shadow-lg border border-border-subtle">
			<p className="text-xs text-text-tertiary">{monthLong(d.month)}</p>
			<p className="text-sm font-semibold text-primary">{formatCurrency(d.revenue)}</p>
		</div>
	);
}

export default function FieldAddedRevenueTrendChart({ trend }: FieldAddedRevenueTrendChartProps) {
	// null / empty = all technicians; otherwise only the selected techIds feed the series.
	const [selected, setSelected] = useState<string[] | null>(null);

	const handleToggle = (value: string | null) => {
		if (value === null) {
			setSelected(null);
			return;
		}
		setSelected((prev) => {
			const set = new Set(prev ?? []);
			if (set.has(value)) set.delete(value);
			else set.add(value);
			return set.size ? [...set] : null;
		});
	};

	const series = useMemo<Point[]>(() => {
		const active = selected && selected.length ? new Set(selected) : null;
		const months = [...new Set(trend.points.map((p) => p.month))].sort();
		const byMonth = new Map<string, number>(months.map((m) => [m, 0]));
		for (const p of trend.points) {
			if (active && !active.has(p.techId)) continue;
			byMonth.set(p.month, (byMonth.get(p.month) ?? 0) + p.revenue);
		}
		return months.map((m) => ({
			month: m,
			revenue: Math.round((byMonth.get(m) ?? 0) * 100) / 100,
		}));
	}, [trend.points, selected]);

	const techOptions = useMemo(
		() => trend.techs.map((t) => ({ value: t.id, label: t.name })),
		[trend.techs],
	);

	return (
		<Card
			className="h-full"
			title="Field-Added Revenue"
			headerAction={
				<DropdownFilter
					placeholder="Technicians"
					options={techOptions}
					values={selected}
					onChange={handleToggle}
				/>
			}
		>
			{trend.points.length === 0 ? (
				<div className="flex-1 min-h-0 flex items-center justify-center">
					<p className="text-sm text-text-muted">No field-added revenue in this period</p>
				</div>
			) : (
				<div className="flex-1 min-h-0">
					<ResponsiveContainer width="100%" height="100%" minWidth={0}>
						<AreaChart data={series} margin={{ top: 8, right: 12, bottom: 4, left: 8 }}>
							<defs>
								<linearGradient id="fieldAddedRevenueFill" x1="0" y1="0" x2="0" y2="1">
									<stop offset="0%" stopColor="var(--color-chart-primary)" stopOpacity={0.35} />
									<stop offset="100%" stopColor="var(--color-chart-primary)" stopOpacity={0.02} />
								</linearGradient>
							</defs>
							<CartesianGrid vertical={false} stroke="var(--color-border-subtle)" />
							<XAxis
								dataKey="month"
								tickFormatter={monthShort}
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
							<Tooltip content={<TrendTooltip />} cursor={{ stroke: "var(--color-chart-axis)" }} />
							<Area
								type="monotone"
								dataKey="revenue"
								stroke="var(--color-chart-primary)"
								strokeWidth={2}
								fill="url(#fieldAddedRevenueFill)"
								dot={false}
								activeDot={{ r: 4 }}
							/>
						</AreaChart>
					</ResponsiveContainer>
				</div>
			)}
		</Card>
	);
}
