import { useState, useEffect } from "react";
import { Search, Plus, LayoutGrid, LayoutList } from "lucide-react";
import { useVehiclesQuery, useCreateVehicleMutation } from "../../hooks/useVehicles";
import VehicleCard from "../../components/vehicles/VehicleCard";
import CreateVehicle from "../../components/vehicles/CreateVehicle";
import EditVehicle from "../../components/vehicles/EditVehicle";
import type { Vehicle } from "../../types/vehicles";
import LoadSvg from "../../assets/icons/loading.svg?react";
import BoxSvg from "../../assets/icons/box.svg?react";
import ErrSvg from "../../assets/icons/error.svg?react";

type StatusFilter = "all" | "active" | "inactive";
type ViewMode = "card" | "list";

export default function VehiclesPage() {
	const [searchInput, setSearchInput] = useState("");
	const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
	const [viewMode, setViewMode] = useState<ViewMode>("card");
	const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
	const [isEditModalOpen, setIsEditModalOpen] = useState(false);
	const [selectedVehicle, setSelectedVehicle] = useState<Vehicle | null>(null);

	const { data: vehicles, isLoading, error, refetch } = useVehiclesQuery(
		statusFilter === "all" ? undefined : statusFilter
	);
	const { mutateAsync: createVehicle } = useCreateVehicleMutation();

	useEffect(() => {
		setSearchInput("");
	}, [statusFilter]);

	const filteredVehicles = vehicles?.filter((v) => {
		if (!searchInput.trim()) return true;
		const q = searchInput.toLowerCase();
		return (
			v.name.toLowerCase().includes(q) ||
			v.type.toLowerCase().includes(q) ||
			(v.license_plate?.toLowerCase().includes(q) ?? false)
		);
	});

	return (
		<div className="text-white">
			{/* Row 1: Title + actions */}
			<div className="flex flex-wrap items-center justify-between gap-3 mb-3">
				<h2 className="text-2xl font-semibold">Vehicles</h2>
				<div className="flex flex-wrap items-center gap-2">
					<button
						onClick={() => setIsCreateModalOpen(true)}
						className="flex items-center gap-2 px-3 py-2 bg-blue-600 hover:bg-blue-700 rounded-md text-sm font-medium cursor-pointer transition-colors"
					>
						<Plus size={15} />
						New Vehicle
					</button>
					<button
						onClick={() => refetch()}
						className="flex items-center gap-2 px-3 py-2 bg-green-600 hover:bg-green-700 rounded-md text-sm font-medium cursor-pointer transition-colors"
					>
						Refresh
					</button>
				</div>
			</div>

			{/* Row 2: Search + filters */}
			<div className="flex flex-wrap items-center gap-2 mb-4">
				<div className="relative flex-1 min-w-[180px]">
					<Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
					<input
						type="text"
						placeholder="Search by name, type, or plate…"
						value={searchInput}
						onChange={(e) => setSearchInput(e.target.value)}
						className="w-full pl-9 pr-3 py-2 rounded-md bg-zinc-800 border border-zinc-700 text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
					/>
				</div>

				<div className="h-8 w-px bg-zinc-700 hidden sm:block" />

				{/* Status filter */}
				<div className="flex items-center gap-1 bg-zinc-800 border border-zinc-700 rounded-md p-1">
					{(["all", "active", "inactive"] as StatusFilter[]).map((s) => (
						<button
							key={s}
							onClick={() => setStatusFilter(s)}
							className={`px-3 py-1 text-xs rounded font-medium cursor-pointer transition-colors capitalize ${
								statusFilter === s ? "bg-blue-600 text-white" : "text-zinc-400 hover:text-white"
							}`}
						>
							{s}
						</button>
					))}
				</div>

				{/* View mode toggle */}
				<div className="flex items-center gap-1 bg-zinc-800 border border-zinc-700 rounded-md p-1">
					<button
						onClick={() => setViewMode("card")}
						title="Card View"
						className={`p-1.5 rounded cursor-pointer transition-colors ${
							viewMode === "card" ? "bg-blue-600 text-white" : "text-zinc-400 hover:text-white"
						}`}
					>
						<LayoutGrid size={15} />
					</button>
					<button
						onClick={() => setViewMode("list")}
						title="List View"
						className={`p-1.5 rounded cursor-pointer transition-colors ${
							viewMode === "list" ? "bg-blue-600 text-white" : "text-zinc-400 hover:text-white"
						}`}
					>
						<LayoutList size={15} />
					</button>
				</div>
			</div>

			{/* Loading */}
			{isLoading && (
				<div className="w-full h-[400px] flex flex-col justify-center items-center">
					<LoadSvg className="w-12 h-12 mb-3" />
					<h1 className="text-center text-xl mt-3">Please wait...</h1>
				</div>
			)}

			{/* Error */}
			{error && !isLoading && (
				<div className="w-full h-[400px] flex flex-col justify-center items-center">
					<ErrSvg className="w-15 h-15 mb-1" />
					<h1 className="text-center text-xl mt-1">An error has occurred.</h1>
					<h2 className="text-center text-zinc-500 mt-1">{error.message}</h2>
				</div>
			)}

			{/* Empty */}
			{!isLoading && !error && filteredVehicles?.length === 0 && (
				<div className="w-full h-[400px] flex flex-col justify-center items-center">
					<BoxSvg className="w-15 h-15 mb-1" />
					<h1 className="text-center text-xl mt-1">
						{searchInput ? "No vehicles found." : "No vehicles yet."}
					</h1>
					{searchInput && (
						<p className="text-center text-zinc-500 mt-2">Try adjusting your search terms.</p>
					)}
				</div>
			)}

			{/* Grid / List */}
			{!isLoading && !error && filteredVehicles && filteredVehicles.length > 0 && (
				<div
					className={
						viewMode === "card"
							? "grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(288px,1fr))]"
							: "flex flex-col gap-2"
					}
				>
					{filteredVehicles.map((vehicle) => (
						<VehicleCard
							key={vehicle.id}
							vehicle={vehicle}
							viewMode={viewMode}
							onEdit={(v) => { setSelectedVehicle(v); setIsEditModalOpen(true); }}
						/>
					))}
				</div>
			)}

			<CreateVehicle
				isModalOpen={isCreateModalOpen}
				setIsModalOpen={setIsCreateModalOpen}
				createVehicle={async (input) => {
					const v = await createVehicle(input);
					return v.id;
				}}
			/>

			{selectedVehicle && (
				<EditVehicle
					isOpen={isEditModalOpen}
					onClose={() => { setIsEditModalOpen(false); setSelectedVehicle(null); }}
					vehicle={selectedVehicle}
				/>
			)}
		</div>
	);
}
