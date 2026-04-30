import { User, Pencil } from "lucide-react";
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
	amber: "bg-amber-500",
	grey: "bg-zinc-600",
};

const STOCK_DOT_TITLES: Record<"green" | "amber" | "grey", string> = {
	green: "Stock OK",
	amber: "Needs restock",
	grey: "No stock configured",
};

function abbrevName(name: string): string {
	const parts = name.trim().split(/\s+/).filter(Boolean);
	if (parts.length === 0) return "—";
	const first = `${parts[0][0]}.`;
	return parts.length > 1 ? `${first} ${parts[parts.length - 1]}` : parts[0];
}

export default function VehicleCard({ vehicle, onEdit, viewMode }: VehicleCardProps) {
	const stockColor = getStockDotColor(vehicle.stock_items);
	const isInactive = vehicle.status === "inactive";

	const techs = vehicle.current_technicians ?? [];
	const visibleTechs = techs.slice(0, 3);
	const overflowCount = techs.length - visibleTechs.length;

	const vehicleDescParts = [
		vehicle.type,
		[vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(" "),
	].filter(Boolean);

	if (viewMode === "list") {
		return (
			<div
				className={`w-full bg-zinc-900 rounded-lg border border-zinc-800 px-4 py-2.5 flex items-center gap-4 motion-safe:transition-colors duration-150 ${
					isInactive ? "opacity-60" : "hover:border-zinc-600"
				}`}
			>
				{/* Name */}
				<div className="flex-1 min-w-0">
					<span className="text-sm font-semibold text-zinc-100 truncate block">{vehicle.name}</span>
				</div>

				{/* Details + plate */}
				<div className="hidden sm:block flex-1 min-w-0">
					<div className="text-xs text-zinc-400 line-clamp-2">
						{vehicleDescParts.length > 0 && vehicleDescParts.join(" · ") + " · "}
						<span className="font-mono">{vehicle.license_plate ?? "—"}</span>
					</div>
				</div>

				{/* Status */}
				<span className={`text-xs font-medium flex-shrink-0 ${isInactive ? "text-zinc-400" : "text-green-400"}`}>
					{vehicle.status === "active" ? "Active" : "Inactive"}
				</span>

				{/* Tech assignment */}
				<div className="flex items-center gap-1.5 flex-shrink-0">
					<User size={12} className="text-zinc-500 flex-shrink-0" />
					{visibleTechs.length === 0 ? (
						<span className="text-xs text-zinc-500 italic">No technicians</span>
					) : (
						<span className="text-xs text-zinc-400">
							{visibleTechs.map((t) => abbrevName(t.name)).join(" · ")}
							{overflowCount > 0 ? ` +${overflowCount}` : ""}
						</span>
					)}
				</div>

				{/* Stock */}
				<div className="flex items-center gap-1 flex-shrink-0">
					<span className={`text-[11px] ${stockColor === "amber" ? "text-amber-600" : "text-zinc-400"}`}>
						Stock
					</span>
					<div
						className={`w-1.5 h-1.5 rounded-full ${STOCK_DOT_CLASSES[stockColor]}`}
						title={STOCK_DOT_TITLES[stockColor]}
					/>
				</div>

				{/* Edit */}
				<button
					onClick={(e) => { e.stopPropagation(); onEdit(vehicle); }}
					className="w-7 h-7 flex items-center justify-center bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 rounded transition-colors flex-shrink-0 focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1 focus-visible:ring-offset-zinc-900"
					aria-label={`Edit ${vehicle.name}`}
				>
					<Pencil size={13} className="text-zinc-400" />
				</button>
			</div>
		);
	}

	return (
		<div
			className={`bg-zinc-900 border border-zinc-800 rounded-lg p-3 motion-safe:transition-colors duration-150 ${
				isInactive ? "opacity-60" : "hover:border-zinc-600"
			}`}
		>
			{/* Row 1: name + status */}
			<div className="flex items-start justify-between gap-2 mb-1.5">
				<span className="text-sm font-semibold text-zinc-100 truncate">{vehicle.name}</span>
				<span className={`text-xs font-medium flex-shrink-0 mt-px ${isInactive ? "text-zinc-400" : "text-green-400"}`}>
					{vehicle.status === "active" ? "Active" : "Inactive"}
				</span>
			</div>

			{/* Row 2: sub-line — type · year make model · PLATE */}
			<div className="text-xs text-zinc-400 mb-2.5 truncate">
				{vehicleDescParts.length > 0 && vehicleDescParts.join(" · ") + " · "}
				<span className="font-mono">{vehicle.license_plate ?? "—"}</span>
			</div>

			{/* Divider */}
			<div className="h-px bg-zinc-800 mb-2.5" />

			{/* Row 3: tech assignment + stock indicator + edit */}
			<div className="flex items-center justify-between gap-2">
				<div className="flex items-center gap-1.5 min-w-0">
					<User size={12} className="text-zinc-500 flex-shrink-0" />
					{visibleTechs.length === 0 ? (
						<span className="text-xs text-zinc-500 italic">No technicians</span>
					) : (
						<span className="text-xs text-zinc-400 truncate">
							{visibleTechs
								.map((t) => abbrevName(t.name))
								.join(" · ")}
							{overflowCount > 0 ? ` +${overflowCount}` : ""}
						</span>
					)}
				</div>
				<div className="flex items-center gap-2 flex-shrink-0">
					<div className="flex items-center gap-1">
						<span className={`text-[11px] ${stockColor === "amber" ? "text-amber-600" : "text-zinc-400"}`}>
							Stock
						</span>
						<div
							className={`w-1.5 h-1.5 rounded-full ${STOCK_DOT_CLASSES[stockColor]}`}
							title={STOCK_DOT_TITLES[stockColor]}
						/>
					</div>
					<button
						onClick={(e) => { e.stopPropagation(); onEdit(vehicle); }}
						className="w-7 h-7 flex items-center justify-center bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 rounded transition-colors focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1 focus-visible:ring-offset-zinc-900"
						aria-label={`Edit ${vehicle.name}`}
					>
						<Pencil size={13} className="text-zinc-400" />
					</button>
				</div>
			</div>
		</div>
	);
}
