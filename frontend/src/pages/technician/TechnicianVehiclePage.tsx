import { useState, useMemo, useEffect, useRef } from "react";
import { Truck, Package, AlertTriangle, PackageX, X, Search, RotateCcw, SlidersHorizontal, ArrowUpDown } from "lucide-react";
import { useAuthStore } from "../../auth/authStore";
import { useTechnicianByIdQuery } from "../../hooks/useTechnicians";
import { useVehiclesQuery, useVehicleStockQuery, useSetTechnicianVehicleMutation, useRestockRequestMutation } from "../../hooks/useVehicles";
import type { Vehicle, VehicleStockItem } from "../../types/vehicles";

// ── Vehicle Status ────────────────────────────────────────────────────────────

type VehicleStatus = "unavailable" | "in-use" | "stocked" | "available";

function getVehicleStatus(v: Vehicle): VehicleStatus {
	if (v.status === "inactive") return "unavailable";
	if ((v.current_technicians ?? []).length > 0) return "in-use";
	if ((v.stock_items ?? []).some((i) => Number(i.qty_on_hand) > 0)) return "stocked";
	return "available";
}

function VehicleStatusBadge({ status }: { status: VehicleStatus }) {
	const styles: Record<VehicleStatus, string> = {
		unavailable: "bg-zinc-700 text-zinc-400",
		"in-use":    "bg-amber-500/10 text-amber-400",
		stocked:     "bg-green-500/10 text-green-400",
		available:   "bg-zinc-800 text-zinc-400",
	};
	const labels: Record<VehicleStatus, string> = {
		unavailable: "Unavailable",
		"in-use":    "In-use",
		stocked:     "Stocked",
		available:   "Available",
	};
	return (
		<span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0 ${styles[status]}`}>
			{labels[status]}
		</span>
	);
}

// ── Unified Vehicle List ──────────────────────────────────────────────────────

function VehicleList({
	vehicles,
	currentVehicleId = null,
	onSelect,
	onCancel,
	rideAlongPendingId,
	onRideAlongRequest,
	onRideAlongCancel,
	onRideAlongConfirm,
	isPending = false,
}: {
	vehicles: Vehicle[];
	currentVehicleId?: string | null;
	onSelect: (vehicleId: string) => void;
	onCancel?: () => void;
	rideAlongPendingId: string | null;
	onRideAlongRequest: (vehicleId: string) => void;
	onRideAlongCancel: () => void;
	onRideAlongConfirm: (vehicleId: string) => void;
	isPending?: boolean;
}) {
	if (vehicles.length === 0) {
		return (
			<div className="py-10 flex flex-col items-center gap-3">
				<Truck size={28} className="text-zinc-600" />
				<p className="text-sm font-medium text-white">No vehicles available</p>
				<p className="text-xs text-zinc-500 text-center px-6">
					Contact your dispatcher to get a vehicle assigned.
				</p>
			</div>
		);
	}

	return (
		<div>
			{vehicles.map((v) => {
				const status = getVehicleStatus(v);
				const isCurrent = v.id === currentVehicleId;
				const isRideAlongPending = v.id === rideAlongPendingId;
				const subtitleParts = [v.color, v.type].filter(Boolean).join(" ");
				const subtitle = v.license_plate ? `${subtitleParts} · ${v.license_plate}` : subtitleParts;

				return (
					<div key={v.id}>
						<div className={`flex items-center gap-3 px-4 py-3 border-b border-zinc-800/60 ${isCurrent ? "bg-blue-500/[0.07] border-l-2 border-l-blue-500" : ""}`}>
							<div className="flex-1 min-w-0">
								<p className="text-sm font-semibold text-white truncate">{v.name}</p>
								{subtitle && (
									<p className={`text-xs mt-0.5 truncate ${isCurrent ? "text-blue-400/60" : "text-zinc-500"}`}>{subtitle}</p>
								)}
							</div>
							<VehicleStatusBadge status={status} />
							{isCurrent ? (
								<span className="text-xs font-medium px-3 py-1.5 rounded-lg bg-zinc-700 text-zinc-400 shrink-0">
									Current
								</span>
							) : status === "in-use" ? (
								<button
									onClick={() => onRideAlongRequest(v.id)}
									disabled={isPending}
									className="text-xs font-medium px-3 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white transition-colors shrink-0 disabled:opacity-50 disabled:pointer-events-none"
								>
									Select
								</button>
							) : status !== "unavailable" ? (
								<button
									onClick={() => onSelect(v.id)}
									disabled={isPending}
									className="text-xs font-medium px-3 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white transition-colors shrink-0 disabled:opacity-50 disabled:pointer-events-none"
								>
									Select
								</button>
							) : null}
						</div>
						{isRideAlongPending && (
							<div className="px-4 py-3 bg-amber-500/5 border-b border-amber-500/20 flex items-center justify-between gap-3">
								<p className="text-xs text-amber-300">
									Ride along with{" "}
									{(v.current_technicians ?? []).map((t) => t.name).join(", ")}?
								</p>
								<div className="flex items-center gap-2 shrink-0">
									<button
										onClick={onRideAlongCancel}
										disabled={isPending}
										className="text-xs text-zinc-400 hover:text-zinc-200 transition-colors disabled:opacity-50 py-2.5 px-1"
									>
										Cancel
									</button>
									<button
										onClick={() => onRideAlongConfirm(v.id)}
										disabled={isPending}
										className="text-xs font-medium px-3 py-2.5 rounded-lg bg-amber-500/20 text-amber-300 hover:bg-amber-500/30 transition-colors disabled:opacity-50 disabled:pointer-events-none"
									>
										Confirm
									</button>
								</div>
							</div>
						)}
					</div>
				);
			})}
			{onCancel && (
				<button
					onClick={onCancel}
					className="w-full py-3 text-sm text-zinc-500 hover:text-zinc-300 transition-colors text-center border-t border-zinc-800"
				>
					Cancel
				</button>
			)}
		</div>
	);
}

// ── Stock Item Row ────────────────────────────────────────────────────────────

function formatUnit(unit: string | undefined): string {
	if (!unit) return "";
	return unit.toLowerCase() === "each" ? "count" : unit;
}

function StockItemRow({
	item,
	onRestock,
}: {
	item: VehicleStockItem;
	onRestock: (item: VehicleStockItem) => void;
}) {
	const isEmpty = Number(item.qty_on_hand) === 0;
	const isLow = Number(item.qty_on_hand) > 0 && Number(item.qty_on_hand) <= Number(item.qty_min);
	const unit = formatUnit(item.inventory_item.unit);

	const qtyColor = isEmpty ? "text-red-400" : isLow ? "text-amber-400" : "text-white";

	return (
		<div className="flex items-center gap-3 px-4 py-3 border-b border-zinc-800/60 last:border-0">
			<div className="flex-1 min-w-0">
				<p className="text-sm text-white truncate" title={item.inventory_item.name}>
					{item.inventory_item.name}
				</p>
				<div className="flex items-center gap-2 mt-0.5">
					{item.inventory_item.category && (
						<span className="text-[10px] px-1.5 py-0.5 bg-zinc-800 text-zinc-400 rounded">
							{item.inventory_item.category}
						</span>
					)}
					<span className="text-[10px] text-zinc-600">
						Min: {Number(item.qty_min)} {unit}
					</span>
				</div>
			</div>
			<div className="text-right shrink-0">
				<p className={`text-base font-semibold tabular-nums ${qtyColor}`}>
					{Number(item.qty_on_hand)}
				</p>
				<p className="text-[10px] text-zinc-600">{unit}</p>
			</div>
			{(isEmpty || isLow) && (
				<button
					onClick={() => onRestock(item)}
					title="Request restock"
					aria-label={`Request restock for ${item.inventory_item.name}`}
					className="flex items-center justify-center w-11 h-11 rounded-lg bg-amber-500/10 text-amber-400 hover:bg-amber-500/20 transition-colors shrink-0"
				>
					<RotateCcw size={14} />
				</button>
			)}
		</div>
	);
}

// ── Category Group Header ─────────────────────────────────────────────────────

function CategoryHeader({ label }: { label: string }) {
	return (
		<div className="px-4 py-1.5 bg-zinc-900/80 border-b border-zinc-800/60">
			<span className="text-[10px] font-semibold uppercase tracking-widest text-zinc-500">
				{label}
			</span>
		</div>
	);
}

// ── Loading Skeleton ──────────────────────────────────────────────────────────

function VehicleCardSkeleton() {
	return (
		<div className="px-4 py-4 animate-pulse">
			<div className="h-4 w-36 bg-zinc-800 rounded mb-2" />
			<div className="h-3 w-28 bg-zinc-800/60 rounded" />
		</div>
	);
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function TechnicianVehiclePage() {
	const { user } = useAuthStore();
	const { data: techProfile, isLoading: techLoading } = useTechnicianByIdQuery(user?.userId ?? null);
	const { data: vehicles = [], isLoading: vehiclesLoading } = useVehiclesQuery();
	const currentVehicleId = techProfile?.current_vehicle_id ?? null;
	const { data: stockItems = [] } = useVehicleStockQuery(currentVehicleId);
	const setVehicle = useSetTechnicianVehicleMutation();
	const restockMutation = useRestockRequestMutation();

	const [showVehicleList, setShowVehicleList] = useState(false);
	const [showCheckOutConfirm, setShowCheckOutConfirm] = useState(false);
	const [switchPendingId, setSwitchPendingId] = useState<string | null>(null);
	const [rideAlongPendingId, setRideAlongPendingId] = useState<string | null>(null);
	const [searchQuery, setSearchQuery] = useState("");
	const [restockSuccess, setRestockSuccess] = useState<string | null>(null);
	const [restockError, setRestockError] = useState<string | null>(null);
	const [vehicleError, setVehicleError] = useState<string | null>(null);
	const [showFilter, setShowFilter] = useState(false);
	const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
	const [sortMode, setSortMode] = useState<"name" | "category">("name");

	const restockTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const vehicleErrorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	useEffect(() => {
		return () => {
			if (restockTimerRef.current) clearTimeout(restockTimerRef.current);
			if (vehicleErrorTimerRef.current) clearTimeout(vehicleErrorTimerRef.current);
		};
	}, []);

	const currentVehicle = vehicles.find((v) => v.id === currentVehicleId) ??
		techProfile?.current_vehicle ?? null;

	// All categories derived from unfiltered stock items
	const allCategories = useMemo(() => {
		return Array.from(new Set(
			stockItems
				.map((i) => i.inventory_item.category)
				.filter((c): c is string => Boolean(c)),
		)).sort();
	}, [stockItems]);

	const handleSelectVehicle = (vehicleId: string) => {
		if (vehicleId === currentVehicleId) {
			setShowVehicleList(false);
			return;
		}
		if (currentVehicleId) {
			setSwitchPendingId(vehicleId);
			return;
		}
		if (!user?.userId) return;
		setVehicle.mutate(
			{ technicianId: user.userId, vehicleId },
			{
				onError: () => {
					setVehicleError("Failed to assign vehicle. Please try again.");
					vehicleErrorTimerRef.current = setTimeout(() => setVehicleError(null), 4000);
				},
			},
		);
		setShowVehicleList(false);
	};

	const handleConfirmSwitch = () => {
		if (!switchPendingId || !user?.userId) return;
		setVehicle.mutate(
			{ technicianId: user.userId, vehicleId: switchPendingId },
			{
				onError: () => {
					setVehicleError("Failed to switch vehicle. Please try again.");
					vehicleErrorTimerRef.current = setTimeout(() => setVehicleError(null), 4000);
				},
			},
		);
		setSwitchPendingId(null);
		setShowVehicleList(false);
	};

	const handleRideAlongConfirm = (vehicleId: string) => {
		if (!user?.userId) return;
		setVehicle.mutate(
			{ technicianId: user.userId, vehicleId },
			{
				onError: () => {
					setVehicleError("Failed to assign vehicle. Please try again.");
					vehicleErrorTimerRef.current = setTimeout(() => setVehicleError(null), 4000);
				},
			},
		);
		setRideAlongPendingId(null);
		setShowVehicleList(false);
	};

	const handleCheckOut = () => {
		if (!user?.userId) return;
		setVehicle.mutate(
			{ technicianId: user.userId, vehicleId: null },
			{
				onError: () => {
					setVehicleError("Failed to check out. Please try again.");
					vehicleErrorTimerRef.current = setTimeout(() => setVehicleError(null), 4000);
				},
			},
		);
		setShowCheckOutConfirm(false);
	};

	const handleRestock = (item: VehicleStockItem) => {
		if (!currentVehicleId) return;
		restockMutation.mutate(
			{ vehicleId: currentVehicleId, itemId: item.id, data: {} },
			{
				onSuccess: () => {
					if (restockTimerRef.current) clearTimeout(restockTimerRef.current);
					setRestockError(null);
					setRestockSuccess(item.inventory_item.name);
					restockTimerRef.current = setTimeout(() => setRestockSuccess(null), 3000);
				},
				onError: () => {
					if (restockTimerRef.current) clearTimeout(restockTimerRef.current);
					setRestockSuccess(null);
					setRestockError("Failed to send restock request. Please try again.");
					restockTimerRef.current = setTimeout(() => setRestockError(null), 4000);
				},
			},
		);
	};

	const toggleCategory = (cat: string) => {
		setSelectedCategories((prev) =>
			prev.includes(cat) ? prev.filter((c) => c !== cat) : [...prev, cat],
		);
	};

	const { filteredItems, outOfStockItems, lowStockItems, sortedItems } = useMemo(() => {
		const q = searchQuery.toLowerCase();
		const filtered = stockItems.filter((item) => {
			const matchesSearch =
				!q ||
				item.inventory_item.name.toLowerCase().includes(q) ||
				(item.inventory_item.category?.toLowerCase().includes(q) ?? false);
			const matchesCategory =
				selectedCategories.length === 0 ||
				selectedCategories.includes(item.inventory_item.category ?? "");
			return matchesSearch && matchesCategory;
		});

		const outOfStock = filtered.filter((i) => Number(i.qty_on_hand) === 0);
		const lowStock = filtered.filter(
			(i) => Number(i.qty_on_hand) > 0 && Number(i.qty_on_hand) <= Number(i.qty_min),
		);

		const sorted = [...filtered].sort((a, b) => {
			if (sortMode === "name") {
				return a.inventory_item.name.localeCompare(b.inventory_item.name);
			}
			// Category mode: named categories A→Z, uncategorized last
			const catA = a.inventory_item.category ?? "";
			const catB = b.inventory_item.category ?? "";
			if (catA !== catB) {
				if (!catA) return 1;
				if (!catB) return -1;
				return catA.localeCompare(catB);
			}
			return a.inventory_item.name.localeCompare(b.inventory_item.name);
		});

		return {
			filteredItems: filtered,
			outOfStockItems: outOfStock,
			lowStockItems: lowStock,
			sortedItems: sorted,
		};
	}, [stockItems, searchQuery, selectedCategories, sortMode]);

	// Build category groups for grouped render mode
	const categoryGroups = useMemo(() => {
		if (sortMode !== "category") return null;
		const groups: { label: string; items: VehicleStockItem[] }[] = [];
		for (const item of sortedItems) {
			const label = item.inventory_item.category || "Uncategorized";
			const last = groups[groups.length - 1];
			if (last && last.label === label) {
				last.items.push(item);
			} else {
				groups.push({ label, items: [item] });
			}
		}
		return groups;
	}, [sortedItems, sortMode]);

	const filtersActive = selectedCategories.length > 0;
	const isPageLoading = techLoading || vehiclesLoading;

	// ── Switch confirmation overlay ───────────────────────────────────────────
	if (switchPendingId) {
		const pending = vehicles.find((v) => v.id === switchPendingId);
		return (
			<div className="max-w-lg mx-auto space-y-4">
				<div className="rounded-xl border border-zinc-800 overflow-hidden">
					<div className="px-4 py-3 bg-zinc-900/60 border-b border-zinc-800 flex items-center gap-2">
						<Truck size={15} className="text-zinc-500" />
						<span className="text-xs font-medium text-zinc-400 uppercase tracking-wide">Switch Vehicle</span>
					</div>
					<div className="px-4 py-5">
						<p className="text-sm text-zinc-300 mb-1">
							Switch to <span className="text-white font-medium">{pending?.name}</span>?
						</p>
						<p className="text-xs text-zinc-500 mb-4">
							Parts tracked today stay on record — switching won't remove them.
						</p>
						<div className="flex gap-2">
							<button
								onClick={() => setSwitchPendingId(null)}
								disabled={setVehicle.isPending}
								className="flex-1 py-2 text-sm rounded-lg border border-zinc-700 text-zinc-300 hover:bg-zinc-800 transition-colors disabled:opacity-50"
							>
								Cancel
							</button>
							<button
								onClick={handleConfirmSwitch}
								disabled={setVehicle.isPending}
								className="flex-1 py-2 text-sm rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-medium transition-colors disabled:opacity-50"
							>
								{setVehicle.isPending ? "Switching…" : "Switch"}
							</button>
						</div>
					</div>
				</div>
			</div>
		);
	}

	return (
		<div className="max-w-lg mx-auto space-y-4">
			{/* ── Vehicle card ──────────────────────────────────────────────────── */}
			<div className="rounded-xl border border-zinc-800 overflow-hidden">
				<div className="px-4 py-3 bg-zinc-900/60 border-b border-zinc-800 flex items-center gap-2">
					<Truck size={15} className="text-zinc-500" />
					<span className="text-xs font-medium text-zinc-400 uppercase tracking-wide">Vehicle</span>
				</div>

				{isPageLoading ? (
					<VehicleCardSkeleton />
				) : !currentVehicle ? (
					/* ── State A: No vehicle selected ──────────────────────────── */
					<>
						<div className="px-4 py-5 flex items-center gap-3 border-b border-zinc-800">
							<div className="flex items-center justify-center w-9 h-9 rounded-lg bg-zinc-800 shrink-0">
								<Truck size={17} className="text-zinc-500" />
							</div>
							<div>
								<p className="text-sm font-medium text-white">No vehicle selected</p>
								<p className="text-xs text-zinc-500 mt-0.5">Select a vehicle to begin your day</p>
							</div>
						</div>
						<VehicleList
							vehicles={vehicles}
							onSelect={handleSelectVehicle}
							rideAlongPendingId={rideAlongPendingId}
							onRideAlongRequest={setRideAlongPendingId}
							onRideAlongCancel={() => setRideAlongPendingId(null)}
							onRideAlongConfirm={handleRideAlongConfirm}
							isPending={setVehicle.isPending}
						/>
					</>
				) : showVehicleList ? (
					/* ── State C: Switching ─────────────────────────────────────── */
					<VehicleList
						vehicles={vehicles.filter((v) => v.status === "active")}
						currentVehicleId={currentVehicleId}
						onSelect={handleSelectVehicle}
						onCancel={() => setShowVehicleList(false)}
						rideAlongPendingId={rideAlongPendingId}
						onRideAlongRequest={setRideAlongPendingId}
						onRideAlongCancel={() => setRideAlongPendingId(null)}
						onRideAlongConfirm={handleRideAlongConfirm}
						isPending={setVehicle.isPending}
					/>
				) : showCheckOutConfirm ? (
					/* ── Check-out confirmation ─────────────────────────────────── */
					<div className="px-4 py-4">
						<p className="text-sm text-zinc-300 mb-1">
							Check out of <span className="text-white font-medium">{currentVehicle.name}</span>?
						</p>
						<p className="text-xs text-zinc-500 mb-4">
							Your stock records will remain. You can select a vehicle again tomorrow.
						</p>
						<div className="flex gap-2">
							<button
								onClick={() => setShowCheckOutConfirm(false)}
								disabled={setVehicle.isPending}
								className="flex-1 py-2 text-sm rounded-lg border border-zinc-700 text-zinc-300 hover:bg-zinc-800 transition-colors disabled:opacity-50"
							>
								Cancel
							</button>
							<button
								onClick={handleCheckOut}
								disabled={setVehicle.isPending}
								className="flex-1 py-2 text-sm rounded-lg bg-red-600/80 hover:bg-red-600 text-white font-medium transition-colors disabled:opacity-50"
							>
								{setVehicle.isPending ? "Checking out…" : "Check Out"}
							</button>
						</div>
					</div>
				) : (
					/* ── State B: Vehicle selected ──────────────────────────────── */
					<div className="px-4 py-4">
						<div className="flex items-start justify-between gap-3">
							<div className="min-w-0">
								<p className="font-semibold text-white truncate">{currentVehicle.name}</p>
								{(() => {
									const cv = currentVehicle;
									const subtitleParts = [cv.color, cv.type].filter(Boolean).join(" ");
									const subtitle = cv.license_plate ? `${subtitleParts} · ${cv.license_plate}` : subtitleParts;
									return subtitle ? (
										<p className="text-sm text-zinc-500 mt-0.5 truncate">{subtitle}</p>
									) : null;
								})()}
								{currentVehicle.notes && (
									<p className="text-xs text-zinc-500 mt-2 leading-relaxed line-clamp-3">
										{currentVehicle.notes}
									</p>
								)}
							</div>
							<div className="flex items-center gap-3 shrink-0">
								<button
									onClick={() => setShowVehicleList(true)}
									className="text-sm text-blue-400 hover:text-blue-300 font-medium transition-colors"
								>
									Switch
								</button>
								<button
									onClick={() => setShowCheckOutConfirm(true)}
									className="text-sm text-zinc-500 hover:text-zinc-300 font-medium transition-colors"
								>
									Check out
								</button>
							</div>
						</div>
					</div>
				)}
			</div>

			{/* ── Inventory ─────────────────────────────────────────────────────── */}
			{currentVehicleId && !showVehicleList && !showCheckOutConfirm && (
				<div className="rounded-xl border border-zinc-800 overflow-hidden">
					<div className="px-4 py-3 bg-zinc-900/60 border-b border-zinc-800 flex items-center gap-2">
						<Package size={15} className="text-zinc-500" />
						<span className="text-xs font-medium text-zinc-400 uppercase tracking-wide">Inventory</span>
					</div>

					{/* Out of stock bar */}
					{outOfStockItems.length > 0 && (
						<div role="status" className="flex items-center gap-2 px-4 py-2 border-b border-zinc-800 bg-red-500/5 text-red-400 text-xs font-medium">
							<PackageX size={13} aria-hidden="true" />
							{outOfStockItems.length} item{outOfStockItems.length > 1 ? "s" : ""} out of stock
						</div>
					)}
					{/* Low stock bar */}
					{lowStockItems.length > 0 && (
						<div role="status" className="flex items-center gap-2 px-4 py-2 border-b border-zinc-800 bg-amber-500/5 text-amber-400 text-xs font-medium">
							<AlertTriangle size={13} aria-hidden="true" />
							{lowStockItems.length} item{lowStockItems.length > 1 ? "s" : ""} low stock
						</div>
					)}

					{/* Search + filter + sort toolbar */}
					<div className="px-4 py-2 border-b border-zinc-800 space-y-2">
						<div className="flex items-center gap-2">
							<div className="relative flex-1">
								<Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-600 pointer-events-none" />
								<input
									type="text"
									placeholder="Search items..."
									value={searchQuery}
									onChange={(e) => setSearchQuery(e.target.value)}
									aria-label="Search inventory items"
									className="w-full bg-zinc-800/60 border border-zinc-700 rounded-lg pl-8 pr-8 py-1.5 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-zinc-500"
								/>
								{searchQuery && (
									<button
										onClick={() => setSearchQuery("")}
										aria-label="Clear search"
										className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300 transition-colors"
									>
										<X size={13} />
									</button>
								)}
							</div>
							{allCategories.length > 0 && (
								<button
									onClick={() => setShowFilter((v) => !v)}
									aria-label="Filter by category"
									title="Filter by category"
									className={`flex items-center justify-center w-11 h-11 rounded-lg border transition-colors shrink-0 ${
										filtersActive
											? "bg-blue-600/20 border-blue-600/40 text-blue-300"
											: "bg-zinc-800/60 border-zinc-700 text-zinc-500 hover:text-zinc-300 hover:border-zinc-600"
									}`}
								>
									<SlidersHorizontal size={13} />
								</button>
							)}
							<button
								onClick={() => setSortMode((m) => m === "name" ? "category" : "name")}
								aria-label={sortMode === "name" ? "Sort by category" : "Sort by name"}
								title={sortMode === "name" ? "Sort by category" : "Sort by name"}
								className={`flex items-center justify-center w-11 h-11 rounded-lg border transition-colors shrink-0 ${
									sortMode === "category"
										? "bg-blue-600/20 border-blue-600/40 text-blue-300"
										: "bg-zinc-800/60 border-zinc-700 text-zinc-500 hover:text-zinc-300 hover:border-zinc-600"
								}`}
							>
								<ArrowUpDown size={13} />
							</button>
						</div>

						{/* Category filter chips */}
						{showFilter && allCategories.length > 0 && (
							<div className="flex flex-wrap gap-1.5">
								{allCategories.map((cat) => {
									const active = selectedCategories.includes(cat);
									return (
										<button
											key={cat}
											onClick={() => toggleCategory(cat)}
											className={`text-[11px] px-2.5 py-1 rounded-full border transition-colors ${
												active
													? "bg-blue-600/20 border-blue-600/40 text-blue-300"
													: "bg-zinc-800 border-zinc-700 text-zinc-400 hover:border-zinc-600 hover:text-zinc-300"
											}`}
										>
											{cat}
										</button>
									);
								})}
								{filtersActive && (
									<button
										onClick={() => setSelectedCategories([])}
										className="flex items-center gap-1 text-[11px] px-2 py-1 rounded-full text-zinc-500 hover:text-zinc-300 transition-colors"
									>
										<X size={10} />
										Clear
									</button>
								)}
							</div>
						)}
					</div>

					{/* Stock list */}
					{sortedItems.length === 0 ? (
						<p className="px-4 py-8 text-center text-sm text-zinc-600">
							{searchQuery && filtersActive
							? `No items match "${searchQuery}" in selected categories`
							: searchQuery
							? `No items match "${searchQuery}"`
							: filtersActive
							? "No items in selected categories"
							: "No items in stock"}
						</p>
					) : categoryGroups ? (
						<div className="max-h-[50vh] overflow-y-auto">
							{categoryGroups.map((group) => (
								<div key={group.label}>
									<CategoryHeader label={group.label} />
									{group.items.map((item) => (
										<StockItemRow key={item.id} item={item} onRestock={handleRestock} />
									))}
								</div>
							))}
						</div>
					) : (
						<div className="max-h-[50vh] overflow-y-auto">
							{sortedItems.map((item) => (
								<StockItemRow key={item.id} item={item} onRestock={handleRestock} />
							))}
						</div>
					)}
				</div>
			)}

			{/* Toasts */}
			{restockSuccess && (
				<div role="status" className="fixed bottom-20 left-1/2 -translate-x-1/2 bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-2 text-sm text-white shadow-xl whitespace-nowrap">
					Restock requested for {restockSuccess}
				</div>
			)}
			{restockError && (
				<div role="alert" className="fixed bottom-20 left-1/2 -translate-x-1/2 bg-red-950 border border-red-800 rounded-lg px-4 py-2 text-sm text-red-300 shadow-xl whitespace-nowrap">
					{restockError}
				</div>
			)}
			{vehicleError && (
				<div role="alert" className="fixed bottom-20 left-1/2 -translate-x-1/2 bg-red-950 border border-red-800 rounded-lg px-4 py-2 text-sm text-red-300 shadow-xl whitespace-nowrap">
					{vehicleError}
				</div>
			)}
		</div>
	);
}
