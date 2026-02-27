import { formatCurrency } from "../../util/util";
import type { UnscheduledRevenueResponse, UnscheduledJobRevenue } from "../../types/reports";

interface UnscheduledRevenueProps {
	data: UnscheduledRevenueResponse;
}

interface RevenueLevelConfig {
	key: "new" | "warning" | "critical";
	label: string;
	color: string;
	dotClass: string;
	days: string;
}

const REVENUE_LEVELS: RevenueLevelConfig[] = [
	{ key: "new", label: "New", color: "#10b981", dotClass: "bg-emerald-500", days: "< 7 days" },
	{ key: "warning", label: "Aging", color: "#f59e0b", dotClass: "bg-amber-500", days: "7–30 days" },
	{ key: "critical", label: "Critical", color: " #ef4444", dotClass: "bg-red-500", days: "> 30 days" },
];

export default function UnscheduledRevenue({ data }: UnscheduledRevenueProps) {
	const { totalRevenue, jobCount } = data;

	const segments = REVENUE_LEVELS.map((b) => {
		const bucket: UnscheduledJobRevenue = data[b.key];
		const pct = totalRevenue > 0 ? (bucket.revenue / totalRevenue) * 100 : 0;
		return { ...b, bucket, pct };
	});

	return (
		<div className="flex flex-col h-full">
			<div className="flex items-center justify-between mb-1">
				<p className="text-sm text-zinc-400 font-medium">Unscheduled Job Revenue</p>
				<span className="text-[11px] font-medium text-zinc-400 bg-zinc-800 px-2 py-0.5 rounded-full">
					{jobCount} {jobCount === 1 ? "Job" : "Jobs"}
				</span>
			</div>

			<p className="text-3xl font-bold text-white tracking-tight mb-5">
				{formatCurrency(totalRevenue)}
			</p>

			<div className="flex w-full h-3 rounded-full overflow-hidden mb-6">
				{segments.map((seg) =>
					seg.pct > 0 ? (
						<div
							key={seg.key}
							className="h-full transition-all duration-300"
							style={{
								width: `${seg.pct}%`,
								backgroundColor: seg.color,
							}}
						/>
					) : null,
				)}
			</div>

			<div className="flex flex-col gap-1">
				{segments.map((seg) => (
					<div
						key={seg.key}
						className="flex items-center justify-between text-sm px-2 py-2 rounded-lg cursor-pointer transition-colors hover:bg-white/5"
					>
						<div className="flex items-center gap-2.5">
							<span
								className={`w-2 h-2 rounded-full shrink-0 ${seg.dotClass}`}
							/>
							<span className="text-zinc-400">{seg.label}</span>
						</div>
						<span
							className={`font-medium ${
								seg.key === "critical" && seg.bucket.revenue > 0
									? "text-red-400"
									: seg.key === "critical"
										? "text-zinc-700"
										: "text-white"
							}`}
						>
							{formatCurrency(seg.bucket.revenue)}
						</span>
					</div>
				))}
			</div>

			<div className="flex items-center justify-center gap-4 mt-auto pt-4 border-t border-zinc-800">
				{REVENUE_LEVELS.map((level) => (
					<div key={level.key} className="flex items-center gap-1.5">
						<span className={`w-2 h-2 rounded-full shrink-0 ${level.dotClass}`} />
						<span className="text-[11px] text-zinc-500">
							{level.label}
							<span className="text-zinc-700 ml-1">{level.days}</span>
						</span>
					</div>
				))}
			</div>
		</div>
	);
}
