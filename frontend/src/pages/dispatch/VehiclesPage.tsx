import { useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { Plus } from "lucide-react";
import { useVehiclesQuery, useCreateVehicleMutation } from "../../hooks/useVehicles";
import VehicleCard from "../../components/vehicles/VehicleCard";
import CreateVehicle from "../../components/vehicles/CreateVehicle";
import EditVehicle from "../../components/vehicles/EditVehicle";
import type { Vehicle } from "../../types/vehicles";
import LoadSvg from "../../assets/icons/loading.svg?react";
import BoxSvg from "../../assets/icons/box.svg?react";
import ErrSvg from "../../assets/icons/error.svg?react";
import SearchBar from "../../components/ui/SearchBar";
import ViewToggle from "../../components/ui/ViewToggle";
import FilterChips, { type FilterChip } from "../../components/ui/FilterChips";
import PageControls from "../../components/ui/PageControls";
import StatusFilter from "../../components/ui/StatusFilter";
import PageHeader from "../../components/ui/PageHeader";

export default function VehiclesPage() {
	const navigate = useNavigate();
	const location = useLocation();
	const [searchInput, setSearchInput] = useState("");
	const [viewMode, setViewMode] = useState<"card" | "list">("card");
	const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
	const [isEditModalOpen, setIsEditModalOpen] = useState(false);
	const [selectedVehicle, setSelectedVehicle] = useState<Vehicle | null>(null);

	const queryParams = new URLSearchParams(location.search);
	const statusParam = queryParams.get("status") as "active" | "inactive" | null;
	const searchFilter = queryParams.get("search");

	const { data: vehicles, isLoading, error } = useVehiclesQuery(statusParam ?? undefined);
	const { mutateAsync: createVehicle } = useCreateVehicleMutation();

	const activeSearch = searchInput || searchFilter;

	const filteredVehicles = vehicles?.filter((v) => {
		if (!activeSearch?.trim()) return true;
		const q = activeSearch.toLowerCase();
		return (
			v.name.toLowerCase().includes(q) ||
			v.type.toLowerCase().includes(q) ||
			(v.license_plate?.toLowerCase().includes(q) ?? false)
		);
	});

	return (
		<div className="text-white">
			<PageHeader title="Vehicles">
				<button
					onClick={() => setIsCreateModalOpen(true)}
					className="flex items-center gap-2 px-3 py-2 bg-blue-600 hover:bg-blue-700 rounded-md text-sm font-medium cursor-pointer transition-colors"
				>
					<Plus size={15} />
					New Vehicle
				</button>
			</PageHeader>

			<PageControls
				className="mb-4"
				left={
					<SearchBar
						paramKey="search"
						placeholder="Search by name, type, or plate…"
						onValueChange={setSearchInput}
					/>
				}
				middle={
					<StatusFilter
						paramKey="status"
						placeholder="Status"
						options={[
							{ value: "active", label: "Active" },
							{ value: "inactive", label: "Inactive" },
						]}
					/>
				}
				right={<ViewToggle value={viewMode} onChange={setViewMode} />}
			/>

			<FilterChips
				filters={[
					searchFilter
						? {
							label: `Search: "${searchFilter}"`,
							color: "purple" as const,
							onRemove: () => {
								setSearchInput("");
								const next = new URLSearchParams(location.search);
								next.delete("search");
								navigate(`/dispatch/vehicles${next.toString() ? `?${next.toString()}` : ""}`);
							},
						  }
						: null,
				]}
				resultCount={filteredVehicles?.length ?? 0}
				onClearAll={() => {
					setSearchInput("");
					const next = new URLSearchParams(location.search);
					next.delete("search");
					navigate(`/dispatch/vehicles${next.toString() ? `?${next.toString()}` : ""}`);
				}}
			/>

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
						{activeSearch ? "No vehicles found." : "No vehicles yet."}
					</h1>
					{activeSearch && (
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
