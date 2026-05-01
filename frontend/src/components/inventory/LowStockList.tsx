import { useState, useMemo } from "react";
import { ChevronLeft, ChevronRight, AlertTriangle, CheckCircle, MapPin } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { InventoryItem } from "../../types/inventory";
import { calculateStockStatus, getStockStatusTextColor } from "../../util/util";

type PanelStatus = 'healthy' | 'warning' | 'critical';

const STATUS_CONFIG: Record<PanelStatus, {
	Icon: LucideIcon;
	iconClass: string;
	subtitle: string;
	badgeCount: (lowStock: number, outOfStock: number) => number;
}> = {
	healthy: {
		Icon: CheckCircle,
		iconClass: 'text-green-500',
		subtitle: 'All items stocked',
		badgeCount: () => 0,
	},
	warning: {
		Icon: AlertTriangle,
		iconClass: 'text-yellow-500',
		subtitle: 'Items below threshold',
		badgeCount: (low) => low,
	},
	critical: {
		Icon: AlertTriangle,
		iconClass: 'text-red-500',
		subtitle: 'Items out of stock',
		badgeCount: (_low, out) => out,
	},
};

interface LowStockListProps {
	items: InventoryItem[];
	onItemClick?: (itemId: string) => void;
}


export default function LowStockList({ items, onItemClick }: LowStockListProps) {
	const [isCollapsed, setIsCollapsed] = useState(true);

	const alertItems = useMemo(() => {
		return items
			.map(item => ({
				item,
				status: item.stock_status ?? calculateStockStatus(item.quantity, item.low_stock_threshold),
			}))
			.filter(({ status }) => status === 'low' || status === 'out_of_stock')
			.sort((a, b) => a.item.quantity - b.item.quantity);
	}, [items]);

	const lowStockCount = alertItems.length;
	const outOfStockCount = alertItems.filter(({ status }) => status === 'out_of_stock').length;
	const lowButNotOutCount = lowStockCount - outOfStockCount;

	const panelStatus: PanelStatus =
		outOfStockCount > 0 ? 'critical' :
		lowStockCount   > 0 ? 'warning'  : 'healthy';

	const { Icon, iconClass, subtitle, badgeCount } = STATUS_CONFIG[panelStatus];

	return (
		<>
			{/* Panel */}
			<div
				className={`
					fixed top-16 right-0 h-[calc(100vh-4rem)] bg-zinc-900/95 backdrop-blur-sm
					border-l border-zinc-700/50 shadow-2xl shadow-black/50
					transition-all duration-300 ease-in-out z-40
					${isCollapsed ? "w-12" : "w-80 sm:w-96"}
				`}
			>
				{/* Toggle Button */}
				<button
					onClick={() => setIsCollapsed(!isCollapsed)}
					className="absolute -left-3 top-1/2 -translate-y-1/2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white p-1.5 rounded-full border border-zinc-600 shadow-lg transition-all z-50"
					aria-label={isCollapsed ? "Expand panel" : "Collapse panel"}
				>
					{isCollapsed ? <ChevronLeft size={14} /> : <ChevronRight size={14} />}
				</button>

				{/* Expanded Content */}
				{!isCollapsed && (
					<div className="h-full flex flex-col overflow-hidden">
						{/* Header */}
						<div className="px-5 pt-5 pb-4 border-b border-zinc-800">
							<div className="flex items-center justify-between mb-1">
								<h3 className="text-base font-semibold text-white flex items-center gap-2">
									<Icon size={18} className={iconClass} />
									Stock Status
								</h3>
								{/* Badges */}
								<div className="flex items-center gap-1.5">
									{outOfStockCount > 0 && (
										<span className="bg-red-500/20 text-red-400 text-xs font-semibold px-2 py-0.5 rounded-full">
											{outOfStockCount} out
										</span>
									)}
									{lowButNotOutCount > 0 && (
										<span className="bg-yellow-500/20 text-yellow-400 text-xs font-semibold px-2 py-0.5 rounded-full">
											{lowButNotOutCount} low
										</span>
									)}
								</div>
							</div>
							<p className="text-xs text-zinc-500">
								{subtitle}
							</p>
						</div>

						{/* Items List */}
						<div className="flex-1 overflow-y-auto px-4 py-3 scrollbar-thin">
							{lowStockCount === 0 ? (
								<div className="flex flex-col items-center justify-center h-full text-center px-4">
									<div className="w-12 h-12 rounded-full bg-green-500/10 flex items-center justify-center mb-3">
										<CheckCircle size={24} className="text-green-500" />
									</div>
									<p className="text-zinc-300 text-sm font-medium mb-1">
										All stocked up
									</p>
									<p className="text-zinc-500 text-xs">
										No items below threshold
									</p>
								</div>
							) : (
								<div className="space-y-2.5">
									{alertItems.map(({ item, status }) => (
										<div
											key={item.id}
											onClick={() => onItemClick?.(item.id)}
											className={`bg-zinc-800/60 hover:bg-zinc-800 rounded-lg transition-colors ${onItemClick ? "cursor-pointer" : ""}`}
										>
											<div className="p-3">
												<div className="flex items-center gap-3">
													{/* Quantity */}
													<div className={`text-center min-w-[3rem] ${getStockStatusTextColor(status)}`}>
															<span className="text-2xl font-bold leading-none">
																{item.quantity}
															</span>
															<span className="block text-[10px] uppercase tracking-wide opacity-70 mt-0.5">
																left
															</span>
														</div>

														{/* Item details */}
														<div className="flex-1 min-w-0">
															<h4 className="text-sm font-medium text-white leading-snug line-clamp-2 mb-1.5">
																{item.name}
															</h4>
															{item.location && (
																<div className="flex items-center gap-1 text-zinc-500">
																	<MapPin size={10} />
																	<span className="text-xs truncate">
																		{item.location}
																	</span>
																</div>
															)}
														</div>

														{/* Threshold */}
														{item.low_stock_threshold !== null && (
															<div className="text-center min-w-[3rem] text-green-500">
																<span className="text-2xl font-bold leading-none">
																	{item.low_stock_threshold}
																</span>
																<span className="block text-[10px] uppercase tracking-wide opacity-70 mt-0.5">
																	min
																</span>
															</div>
														)}
													</div>
												</div>
											</div>
									))}
								</div>
							)}
						</div>
					</div>
				)}

				{/* Collapsed State */}
				{isCollapsed && (
					<div className="flex flex-col items-center pt-4 gap-2">
						{panelStatus === 'critical' && lowButNotOutCount > 0 ? (
							<>
								<div className="flex flex-col items-center gap-1">
									<AlertTriangle size={16} className="text-red-500" />
									<span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-red-500/20 text-red-400">
										{outOfStockCount}
									</span>
								</div>
								<div className="flex flex-col items-center gap-1">
									<AlertTriangle size={16} className="text-yellow-500" />
									<span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-yellow-500/20 text-yellow-400">
										{lowButNotOutCount}
									</span>
								</div>
							</>
						) : (
							<>
								<Icon size={18} className={iconClass} />
								{lowStockCount > 0 && (
									<span className={`text-xs font-bold px-1.5 py-0.5 rounded ${
										panelStatus === 'critical'
											? 'bg-red-500/20 text-red-400'
											: 'bg-yellow-500/20 text-yellow-400'
									}`}>
										{badgeCount(lowStockCount, outOfStockCount)}
									</span>
								)}
							</>
						)}
					</div>
				)}
			</div>

		</>
	);
}
