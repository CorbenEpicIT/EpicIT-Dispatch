import { PieChart, Pie, Tooltip, ResponsiveContainer } from "recharts";
import Card from "../ui/Card";
import { formatCurrency } from "../../util/util";

export interface PaymentsByMethodDatum {
	method: string;
	amount: number;
	count: number;
}

interface PaymentsByMethodChartProps {
	data: PaymentsByMethodDatum[];
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

function CustomTooltip({
	active,
	payload,
}: {
	active?: boolean;
	payload?: { name: string; value: number; payload: PaymentsByMethodDatum }[];
}) {
	if (!active || !payload?.length) return null;
	const { name, value, payload: datum } = payload[0];
	return (
		<div className="rounded-lg px-3 py-2 bg-base/80 backdrop-blur-md shadow-lg">
			<p className="text-xs text-text-tertiary">{name}</p>
			<p className="text-sm font-semibold text-primary">{formatCurrency(value)}</p>
			<p className="text-xs text-text-tertiary">
				{datum.count} {datum.count === 1 ? "payment" : "payments"}
			</p>
		</div>
	);
}

export default function PaymentsByMethodChart({ data, total }: PaymentsByMethodChartProps) {
	const chartData = data.map((entry, i) => ({
		...entry,
		fill: CHART_PALETTE[i % CHART_PALETTE.length],
	}));

	return (
		<Card
			className="h-full"
			title="Payments by Method"
			headerAction={
				<span className="flex items-baseline gap-2">
					<span className="text-xs uppercase tracking-wider text-text-tertiary">
						Collected
					</span>
					<span className="text-xl font-bold text-primary">{formatCurrency(total)}</span>
				</span>
			}
		>
			{total === 0 ? (
				<div className="flex-1 min-h-0 flex items-center justify-center">
					<p className="text-sm text-text-muted">No payments in this period</p>
				</div>
			) : (
				<>
					<div className="relative flex-1 min-h-0">
						<ResponsiveContainer width="100%" height="100%" minWidth={0}>
							<PieChart>
								<Pie
									data={chartData}
									dataKey="amount"
									nameKey="method"
									cx="50%"
									cy="50%"
									outerRadius="90%"
									innerRadius="72%"
									paddingAngle={5}
									stroke={BG_COLOR}
									strokeWidth={3}
									label={false}
								/>
								<Tooltip content={<CustomTooltip />} cursor={false} />
							</PieChart>
						</ResponsiveContainer>
					</div>

					<div className="flex flex-wrap items-center justify-center gap-4 pt-2 shrink-0">
						{chartData.map((entry) => (
							<div key={entry.method} className="flex items-center gap-2">
								<span
									className="inline-block w-3 h-3 rounded-full"
									style={{ backgroundColor: entry.fill }}
								/>
								<span className="text-sm text-text-tertiary">{entry.method}</span>
								<span className="text-sm font-medium text-primary">
									{formatCurrency(entry.amount)}
								</span>
							</div>
						))}
					</div>
				</>
			)}
		</Card>
	);
}
