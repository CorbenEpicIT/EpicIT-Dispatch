import { useLayoutEffect, useRef, useState } from "react";
import {
	Bar,
	BarChart,
	CartesianGrid,
	Cell,
	PieChart,
	ResponsiveContainer,
	Tooltip,
	XAxis,
	YAxis,
	Pie,
} from "recharts";
import type { PageSummaryResponse } from "../../types/reports";

interface PageSummaryProps {
	data: PageSummaryResponse;
	onBarClick?: (label: string) => void;
	fill?: boolean;
}

function CustomTooltip({
	active,
	payload,
}: {
	active?: boolean;
	payload?: { name: string; value: number }[];
}) {
	if (!active || !payload?.length) return null;
	const { name, value } = payload[0];
	return (
		<div className="rounded-lg px-3 py-2 bg-base/80 backdrop-blur-md shadow-lg">
			<p className="text-xs text-text-tertiary">{name}</p>
			<p className="text-sm font-semibold text-primary">
				{formatStat(value, "number")}
			</p>
		</div>
	);
}

// One-sentence explanation per stat shown as a hover title on the label
const STAT_DESCRIPTIONS: Record<string, Record<string, string>> = {
	jobs: {
		Total: "Number of jobs created in the selected range.",
		Open: "Jobs currently Unscheduled, Scheduled, or In Progress (created in range).",
		Unscheduled: "Combined estimated value of jobs still unscheduled.",
		Revenue: "Revenue from job visits completed in the selected range.",
	},
	quotes: {
		Total: "Quotes created in the selected range.",
		Open: "Quotes still open (Draft, Sent, or Viewed).",
		Pipeline: "Total dollar value of open quotes.",
		Approved: "Total dollar value of approved quotes.",
		"Avg. Approve Time": "Average time from a quote being sent to being approved.",
	},
	requests: {
		Total: "Requests created in the selected range.",
		Open: "Requests still open (New or Reviewing).",
		Converted: "Requests that were converted into a job.",
		"Est. Value": "Combined estimated value of requests in the range.",
	},
	invoices: {
		Total: "Invoices issued in the selected range.",
		Issued: "Total amount billed on invoices issued in the range.",
		Collected: "Payments received in the selected range.",
		"Avg. Days to Pay": "Average number of days from invoice issue to payment.",
	},
	clients: {
		Total: "All clients in your organization (all time).",
		New: "Clients added in the selected range.",
		Active: "Clients currently marked active (all time).",
		"Open Balance": "Total outstanding balance owed across all clients.",
		"Avg. Income": "Average billed revenue per client (total billed ÷ all clients).",
	},
	projects: {
		Total: "Projects created in the selected range.",
		Open: "Projects still open (Planning, Active, or On Hold).",
		Overdue: "Projects past their target end date and not yet completed (all time).",
		Budget: "Combined budget of projects created in the range.",
		Committed:
			"Value of jobs attached to those projects — actual where the job is finished, otherwise estimated.",
	},
	inventory: {
		"Total Items": "Active, non-provisional inventory items (current snapshot).",
		Low: "Items at or below their low-stock threshold.",
		"Out of Stock": "Items with zero quantity on hand.",
		"Asset Value": "Total value of stock on hand (quantity × cost).",
	},
};

// Shrinks its text on one line until it fits the parent width 
function FitText({ children }: { children: string }) {
	const ref = useRef<HTMLDivElement>(null);
	const [scale, setScale] = useState(1);

	useLayoutEffect(() => {
		const el = ref.current;
		if (!el) return;
		setScale(1); // reset before measuring at full size
		requestAnimationFrame(() => {
			const parent = el.parentElement;
			if (!parent) return;
			const avail = parent.clientWidth;
			const needed = el.scrollWidth;
			if (needed > avail && avail > 0) {
				setScale(Math.max(0.45, avail / needed));
			}
		});
	}, [children]);

	return (
		<div
			ref={ref}
			className="origin-left whitespace-nowrap"
			style={{ fontSize: `${scale}em` }}
		>
			{children}
		</div>
	);
}

const BG_COLOR = "var(--color-chart-hole-bg)";

const CHART_PALETTE = [
	"var(--color-chart-primary)",
	"var(--color-chart-success)",
	"var(--color-chart-info)",
	"var(--color-chart-warning)",
	"var(--color-chart-error)",
];

const HEALTH_COLORS: Record<string, string> = {
	Sufficient: "var(--color-chart-success)",
	Low: "var(--color-chart-warning)",
	"Out of Stock": "var(--color-chart-error)",
};

const DONUT_MAX_SLICES = 3;

function sliceColor(page: string, label: string, index: number): string {
	if (page === "inventory" && HEALTH_COLORS[label]) return HEALTH_COLORS[label];
	return CHART_PALETTE[index % CHART_PALETTE.length];
}

function formatStat(
	value: number,
	format: "number" | "currency" | "percent" | "duration",
): string {
	switch (format) {
		case "currency":
			return value.toLocaleString(undefined, {
				style: "currency",
				currency: "USD",
			});
		case "percent":
			return `${value.toLocaleString(undefined, { maximumFractionDigits: 1 })}%`;
		case "duration": {
			if (!Number.isFinite(value) || value <= 0) return "—";
			if (value < 1) {
				const hrs = value * 24;
				return `${hrs.toLocaleString(undefined, { maximumFractionDigits: 1 })} hr${hrs === 1 ? "" : "s"}`;
			}
			const days = Number(value.toFixed(1));
			return `${days.toLocaleString(undefined, { maximumFractionDigits: 1 })} day${days === 1 ? "" : "s"}`;
		}
		default:
			return value.toLocaleString();
	}
}

export default function PageSummary({ data, onBarClick, fill }: PageSummaryProps) {
	// Few mutually-exclusive slices → donut (composition); otherwise a bar chart.
	const useDonut =
		data.breakdown.length > 0 && data.breakdown.length <= DONUT_MAX_SLICES;

	return (
		<div className={`flex flex-col gap-4${fill ? " min-h-0 flex-1" : ""}`}>
			<div className="grid grid-cols-[repeat(auto-fit,minmax(6rem,1fr))] gap-3">
				{data.stats.map((stat) => {
					const description = STAT_DESCRIPTIONS[data.page]?.[stat.label];
					return (
						<div
							key={stat.label}
							className="min-w-0 flex-1 overflow-hidden rounded-lg border border-border bg-surface p-3"
						>
							<div
								className={`text-xs text-text-faint${description ? " cursor-help" : ""}`}
								title={description}
							>
								{stat.label}
							</div>
							<div className="mt-1 text-lg font-semibold text-text-primary">
								<FitText>{formatStat(stat.value, stat.format)}</FitText>
							</div>
						</div>
					);
				})}
			</div>

			{data.breakdown.length > 0 && (
				<div className={fill ? "flex min-h-0 flex-1 flex-col" : undefined}>
					<div className="mb-2 text-xs font-medium text-text-secondary">
						{data.breakdownLabel}
					</div>
					<div className={fill ? "min-h-0 flex-1" : undefined}>
					<ResponsiveContainer width="100%" height={fill ? "100%" : 220}>
						{useDonut ? (
							<PieChart>
								<Pie
									data={data.breakdown}
									dataKey="value"
									nameKey="label"
									cx="50%"
									cy="50%"
									outerRadius="90%"
									innerRadius="72%"
									paddingAngle={5}
									stroke={BG_COLOR}
									strokeWidth={3}
									label={false}
									onClick={(entry) => {
										const l = entry?.label ?? entry?.payload?.label;
										if (l != null && onBarClick) {
											onBarClick(String(l));
										}
									}}
									className={onBarClick ? "cursor-pointer" : undefined}
								>
									{data.breakdown.map((entry, i) => (
										<Cell
											key={entry.label}
											fill={sliceColor(data.page, entry.label, i)}
										/>
									))}
								</Pie>
								<Tooltip
									content={<CustomTooltip />}
									cursor={false}
								/>
							</PieChart>
						)
						: (
							<BarChart
								data={data.breakdown}
								onClick={(s) => {
									const l = s?.activeLabel;
									if (l != null && onBarClick) {
										onBarClick(String(l));
									}
								}}
							>
								<CartesianGrid
									strokeDasharray="3 3"
									stroke="var(--color-border)"
								/>
								<XAxis
									dataKey="label"
									tick={{ fontSize: 11, fill: "var(--color-text-faint)" }}
								/>
								<YAxis
									allowDecimals={false}
									tick={{ fontSize: 11, fill: "var(--color-text-faint)" }}
								/>
								<Tooltip
									contentStyle={{
										background: "var(--color-surface)",
										border: "1px solid var(--color-border)",
										borderRadius: 8,
										fontSize: 12,
									}}
								/>
								<Bar
									dataKey="value"
									fill="var(--color-primary)"
									radius={[4, 4, 0, 0]}
									className={onBarClick ? "cursor-pointer" : undefined}
								/>
							</BarChart>
						)}

					</ResponsiveContainer>
					</div>
					{useDonut && (
						<div className="flex flex-wrap items-center justify-center gap-4 pt-2">
							{data.breakdown.map((entry, i) => (
								<div key={entry.label} className="flex items-center gap-2">
									<span
										className="inline-block h-3 w-3 rounded-full"
										style={{
											backgroundColor: sliceColor(
												data.page,
												entry.label,
												i,
											),
										}}
									/>
									<span className="text-sm text-text-tertiary">
										{entry.label}
									</span>
									<span className="text-sm font-medium text-primary">
										{entry.value.toLocaleString()}
									</span>
								</div>
							))}
						</div>
					)}
				</div>
			)}
		</div>
	);
}
