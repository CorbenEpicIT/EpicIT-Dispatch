import { useState } from "react";
import { TrendingUp, TrendingDown } from "lucide-react";

interface TooltipData {
	currentLabel: string;
	previousLabel: string;
	currentDisplay: string;
	previousDisplay: string;
}

interface OverviewCardProps {
	label: string;
	value: number;
	valueDisplay?: string;
	changePercent: number;
	valuePrefix?: string;
	valueSuffix?: string;
	onClick?: () => void;
	tooltip?: TooltipData;
}

export default function OverviewCard({
	label,
	value,
	valueDisplay,
	changePercent,
	valuePrefix = "",
	valueSuffix = "",
	onClick,
	tooltip,
}: OverviewCardProps) {
	const isPositive = changePercent >= 0;
	const [showTooltip, setShowTooltip] = useState(false);

	return (
		<div
			onClick={onClick}
			className={`bg-zinc-900 border border-zinc-800 rounded-lg py-3 px-4 min-w-0 ${
				onClick ? "cursor-pointer hover:border-zinc-700 transition-colors" : ""
			}`}
		>
			<p className="text-sm text-zinc-400 mb-1">{label}</p>
			<div className="flex flex-row flex-wrap items-baseline gap-x-2 gap-y-0.5">
				<p className="text-2xl font-bold text-white whitespace-nowrap">
					{valueDisplay ?? `${valuePrefix}${value}${valueSuffix}`}
				</p>
				<div
					className="relative flex items-center gap-1 whitespace-nowrap"
					onMouseEnter={() => setShowTooltip(true)}
					onMouseLeave={() => setShowTooltip(false)}
				>
					{isPositive ? (
						<TrendingUp size={12} className="text-green-400" />
					) : (
						<TrendingDown size={12} className="text-red-400" />
					)}
					<span
						className={`text-xs font-medium ${
							isPositive ? "text-green-400" : "text-red-400"
						}`}
					>
						{isPositive ? "+" : ""}
						{changePercent}%
					</span>
					<span className="text-xs text-zinc-500">vs prev</span>

					{tooltip && showTooltip && (
						<div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-50 w-64 bg-zinc-800 border border-zinc-700 rounded-lg shadow-xl p-3 pointer-events-none">
							<div className="flex justify-between items-baseline gap-3 mb-2">
								<span className="text-xs text-zinc-400 leading-tight">{tooltip.previousLabel}</span>
								<span className="text-xs font-semibold text-zinc-200 whitespace-nowrap tabular-nums">{tooltip.previousDisplay}</span>
							</div>
							<div className="border-t border-zinc-700 pt-2 flex justify-between items-baseline gap-3">
								<span className="text-xs text-zinc-300 leading-tight">{tooltip.currentLabel}</span>
								<span className="text-xs font-semibold text-white whitespace-nowrap tabular-nums">{tooltip.currentDisplay}</span>
							</div>
							<div className="absolute top-full left-1/2 -translate-x-1/2 w-0 h-0 border-l-[6px] border-l-transparent border-r-[6px] border-r-transparent border-t-[6px] border-t-zinc-700" />
							<div className="absolute top-full mt-px left-1/2 -translate-x-1/2 w-0 h-0 border-l-[5px] border-l-transparent border-r-[5px] border-r-transparent border-t-[5px] border-t-zinc-800" />
						</div>
					)}
				</div>
			</div>
		</div>
	);
}
