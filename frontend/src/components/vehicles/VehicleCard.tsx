import type { Vehicle, VehicleStockItem } from "../../types/vehicles";

interface VehicleCardProps {
	vehicle: Vehicle;
	onEdit: (vehicle: Vehicle) => void;
	viewMode: "card" | "list";
}

function getStockDotColor(stockItems?: VehicleStockItem[]): "green" | "amber" | "grey" {
	if (!stockItems || stockItems.length === 0) return "grey";
	const hasLow = stockItems.some((item) => item.qty_on_hand < item.qty_min);
	return hasLow ? "amber" : "green";
}

const STOCK_DOT_CLASSES: Record<"green" | "amber" | "grey", string> = {
	green: "bg-green-400",
	amber: "bg-amber-400",
	grey: "bg-zinc-600",
};

const STOCK_DOT_TITLES: Record<"green" | "amber" | "grey", string> = {
	green: "Stock OK",
	amber: "Needs restock",
	grey: "No stock configured",
};

export default function VehicleCard({ vehicle, onEdit, viewMode }: VehicleCardProps) {
	const stockColor = getStockDotColor(vehicle.stock_items);
	const isInactive = vehicle.status === "inactive";

	const techs = vehicle.current_technicians ?? [];
	const visibleTechs = techs.slice(0, 3);
	const overflowCount = techs.length - visibleTechs.length;

	const vehicleDetails = [vehicle.type, [vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(" ")]
		.filter(Boolean)
		.join(" · ");

	if (viewMode === "list") {
		return (
			<div
				className={`w-full bg-zinc-900 rounded-lg border border-zinc-800 px-4 py-2.5 flex items-center gap-4 transition ${
					isInactive ? "opacity-60" : ""
				}`}
			>
				{/* Name */}
				<div className="flex-1 min-w-0">
					<span className="text-sm font-semibold text-zinc-100 truncate block">{vehicle.name}</span>
				</div>

				{/* Details */}
				<div className="hidden sm:block flex-1 min-w-0 text-xs text-zinc-500 truncate">{vehicleDetails}</div>

				{/* Plate */}
				<div className="px-2 py-0.5 bg-zinc-800 border border-zinc-700 rounded font-mono text-xs text-zinc-300 flex-shrink-0">
					{vehicle.license_plate ?? "—"}
				</div>

				{/* Status */}
				<div
					className={`px-2 py-0.5 rounded text-xs font-medium border flex-shrink-0 ${
						isInactive
							? "bg-zinc-700/20 border-zinc-600/40 text-zinc-500"
							: "bg-green-500/10 border-green-500/20 text-green-400"
					}`}
				>
					{vehicle.status === "active" ? "Active" : "Inactive"}
				</div>

				{/* Stock dot + techs */}
				<div className="flex items-center gap-1.5 flex-shrink-0">
					<div
						className={`w-2 h-2 rounded-full flex-shrink-0 ${STOCK_DOT_CLASSES[stockColor]}`}
						title={STOCK_DOT_TITLES[stockColor]}
					/>
					{visibleTechs.map((t) => (
						<div
							key={t.id}
							className="px-2 py-0.5 bg-zinc-800 border border-zinc-700 rounded text-xs text-zinc-400"
						>
							{t.name.split(" ")[0][0]}. {t.name.split(" ").slice(-1)[0]}
						</div>
					))}
					{overflowCount > 0 && (
						<div className="px-2 py-0.5 bg-zinc-800 border border-zinc-700 rounded text-xs text-zinc-500">
							+{overflowCount}
						</div>
					)}
				</div>

				{/* Edit */}
				<button
					onClick={(e) => { e.stopPropagation(); onEdit(vehicle); }}
					className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 rounded text-xs text-zinc-300 transition-colors flex-shrink-0"
				>
					Edit
				</button>
			</div>
		);
	}

	return (
		<div
			className={`bg-zinc-900 border border-zinc-800 rounded-lg p-3 transition ${
				isInactive ? "opacity-60" : "hover:border-zinc-600"
			}`}
		>
			{/* Row 1: name, status badge, plate */}
			<div className="flex items-center justify-between gap-2 mb-1.5">
				<div className="flex items-center gap-2 min-w-0">
					<span className="text-sm font-semibold text-zinc-100 truncate">{vehicle.name}</span>
					<div
						className={`px-1.5 py-0.5 rounded text-[10px] font-medium border flex-shrink-0 ${
							isInactive
								? "bg-zinc-700/20 border-zinc-600/40 text-zinc-500"
								: "bg-green-500/10 border-green-500/20 text-green-400"
						}`}
					>
						{vehicle.status === "active" ? "Active" : "Inactive"}
					</div>
				</div>
				<div className="px-2 py-0.5 bg-zinc-800 border border-zinc-700 rounded font-mono text-xs text-zinc-300 flex-shrink-0">
					{vehicle.license_plate ?? "—"}
				</div>
			</div>

			{/* Row 2: details */}
			<div className="text-xs text-zinc-500 mb-2.5 truncate">{vehicleDetails}</div>

			{/* Row 3: stock dot + tech badges + edit */}
			<div className="flex items-center justify-between gap-2">
				<div className="flex items-center gap-1.5 flex-wrap min-w-0">
					<div
						className={`w-2 h-2 rounded-full flex-shrink-0 ${STOCK_DOT_CLASSES[stockColor]}`}
						title={STOCK_DOT_TITLES[stockColor]}
					/>
					{visibleTechs.length === 0 ? (
						<span className="text-xs text-zinc-600">No technicians</span>
					) : (
						visibleTechs.map((t) => (
							<div
								key={t.id}
								className="px-2 py-0.5 bg-zinc-800 border border-zinc-700 rounded text-[10px] text-zinc-400"
							>
								{t.name.split(" ")[0][0]}. {t.name.split(" ").slice(-1)[0]}
							</div>
						))
					)}
					{overflowCount > 0 && (
						<div className="px-2 py-0.5 bg-zinc-800 border border-zinc-700 rounded text-[10px] text-zinc-500">
							+{overflowCount}
						</div>
					)}
				</div>
				<button
					onClick={(e) => { e.stopPropagation(); onEdit(vehicle); }}
					className="px-2.5 py-1 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 rounded text-xs text-zinc-300 transition-colors flex-shrink-0"
				>
					Edit
				</button>
			</div>
		</div>
	);
}
