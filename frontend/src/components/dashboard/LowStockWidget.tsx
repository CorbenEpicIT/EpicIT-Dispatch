import { useNavigate } from "react-router-dom";
import { AlertTriangle, ChevronRight, Package } from "lucide-react";
import { useLowStockInventoryQuery } from "../../hooks/useInventory";

export default function LowStockWidget() {
	const navigate = useNavigate();
	const { data: lowStockItems = [] } = useLowStockInventoryQuery();

	const outOfStock = lowStockItems.filter((i) => i.quantity === 0).length;
	const lowStock = lowStockItems.length - outOfStock;

	if (lowStockItems.length === 0) return null;

	return (
		<div
			onClick={() => navigate("/dispatch/inventory")}
			className="group p-4 bg-zinc-900 border border-zinc-800 rounded-xl cursor-pointer hover:border-amber-500/30 transition-colors"
		>
			<div className="flex items-center justify-between mb-3">
				<div className="flex items-center gap-2">
					<div className="w-8 h-8 rounded-lg bg-amber-500/10 flex items-center justify-center border border-amber-500/20">
						<Package size={16} className="text-amber-400" />
					</div>
					<h4 className="text-sm font-semibold text-white">Inventory Alerts</h4>
				</div>
				<ChevronRight
					size={16}
					className="text-zinc-600 group-hover:text-zinc-400"
				/>
			</div>

			<div className="flex items-center gap-3">
				{outOfStock > 0 && (
					<div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-red-500/10 border border-red-500/20">
						<AlertTriangle size={12} className="text-red-400" />
						<span className="text-xs font-medium text-red-400">
							{outOfStock} out of stock
						</span>
					</div>
				)}
				{lowStock > 0 && (
					<div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-yellow-500/10 border border-yellow-500/20">
						<AlertTriangle size={12} className="text-yellow-400" />
						<span className="text-xs font-medium text-yellow-400">
							{lowStock} low stock
						</span>
					</div>
				)}
			</div>
		</div>
	);
}
