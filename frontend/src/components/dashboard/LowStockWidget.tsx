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
			className="group p-4 bg-base border border-border-subtle rounded-xl cursor-pointer hover:border-warning/30 transition-colors"
		>
			<div className="flex items-center justify-between mb-3">
				<div className="flex items-center gap-2">
					<div className="w-8 h-8 rounded-lg bg-warning/10 flex items-center justify-center border border-warning/20">
						<Package size={16} className="text-warning-text" />
					</div>
					<h4 className="text-sm font-semibold text-white">Inventory Alerts</h4>
				</div>
				<ChevronRight
					size={16}
					className="text-text-faint group-hover:text-text-tertiary"
				/>
			</div>

			<div className="flex items-center gap-3">
				{outOfStock > 0 && (
					<div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-error/10 border border-error/20">
						<AlertTriangle size={12} className="text-error-text" />
						<span className="text-xs font-medium text-error-text">
							{outOfStock} out of stock
						</span>
					</div>
				)}
				{lowStock > 0 && (
					<div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-yellow-500/10 border border-yellow-500/20">
						<AlertTriangle size={12} className="text-warning-text" />
						<span className="text-xs font-medium text-warning-text">
							{lowStock} low stock
						</span>
					</div>
				)}
			</div>
		</div>
	);
}
