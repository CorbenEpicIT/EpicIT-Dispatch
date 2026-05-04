import { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { Plus, ChevronLeft, ChevronRight } from "lucide-react";
import { useAllTechniciansQuery, useCreateTechnicianMutation } from "../../hooks/useTechnicians";
import CreateTechnician from "../../components/technicians/CreateTechnician";
import TechnicianCard from "../../components/technicians/TechnicianCard";
import LoadSvg from "../../assets/icons/loading.svg?react";
import BoxSvg from "../../assets/icons/box.svg?react";
import ErrSvg from "../../assets/icons/error.svg?react";
import SearchBar from "../../components/ui/SearchBar";
import FilterChips, { type FilterChip } from "../../components/ui/FilterChips";
import ViewToggle from "../../components/ui/ViewToggle";
import PageControls from "../../components/ui/PageControls";
import StatusFilter from "../../components/ui/StatusFilter";
import PageHeader from "../../components/ui/PageHeader";

type viewMode = "list" | "card"; 

export default function TechniciansPage() {
	const navigate = useNavigate();
	const location = useLocation();
	const {
		data: technicians,
		isLoading: isFetchLoading,
		error: fetchError,
	} = useAllTechniciansQuery();
	const { mutateAsync: createTechnician } = useCreateTechnicianMutation();
	const [searchInput, setSearchInput] = useState("");
	const [isModalOpen, setIsModalOpen] = useState(false);
	const [viewMode, setViewMode] = useState<viewMode>("card");
	const [perPage, setPerPage] = useState(12);
	const [currentPage, setCurrentPage] = useState(1);

	const queryParams = new URLSearchParams(location.search);
	const searchFilter = queryParams.get('search');
	const statusFilter = queryParams.get('status');

	useEffect(() => {
		setCurrentPage(1);
	}, [searchFilter, searchInput, statusFilter, perPage]);

	// Use searchInput for instant preview, searchFilter for committed filter
	const activeSearch = searchInput || searchFilter;

	const filteredTechnicians = technicians
		?.filter((t) => {
			if (activeSearch) {
				const searchLower = activeSearch.toLowerCase();
				const matchesSearch = 
					t.name.toLowerCase().includes(searchLower) ||
					t.email?.toLowerCase().includes(searchLower) ||
					t.phone?.toLowerCase().includes(searchLower) ||
					t.title?.toLowerCase().includes(searchLower);
				if (!matchesSearch) return false;
			}
			if (statusFilter) {
				return t.status.toLowerCase() === statusFilter.toLowerCase();
			}

			return true;
		})
		.sort((a, b) => {
			const statusOrder = { Available: 0, Busy: 1, Break: 2, Offline: 3 };
			return statusOrder[a.status] - statusOrder[b.status];
		}) ?? [];

	const totalPages = perPage === 0 ? 1: Math.ceil(filteredTechnicians.length / perPage);
	const pagedTechnicians = perPage === 0 ? filteredTechnicians : filteredTechnicians.slice((currentPage - 1) * perPage, currentPage * perPage);

	const removeFilter = (filterType: 'search') => {
		const newParams = new URLSearchParams(location.search);
		newParams.delete(filterType);
		if (filterType === 'search') {
			setSearchInput("");
		}
		navigate(`/dispatch/technicians${newParams.toString() ? `?${newParams.toString()}` : ''}`);
	};

	const clearAllFilters = () => {
		setSearchInput("");
		const next = new URLSearchParams(location.search);
		next.delete("search");
		navigate(`/dispatch/technicians${next.toString() ? `?${next.toString()}` : ""}`);
	};

	const statusCounts = technicians?.reduce((acc, t) => {
		acc[t.status] = (acc[t.status] || 0) + 1;
		return acc;
	}, {} as Record<string, number>) || {};

	return (
		<div className="text-white">
			<PageHeader
				title="Technicians"
				subtitle={
					<div className="flex gap-3 text-xs">
						<span className="text-green-400">● Available: {statusCounts.Available || 0}</span>
						<span className="text-yellow-400">● Busy: {statusCounts.Busy || 0}</span>
						<span className="text-blue-400">● Break: {statusCounts.Break || 0}</span>
						<span className="text-red-400">● Offline: {statusCounts.Offline || 0}</span>
					</div>
				}
			>
				<button
					className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-md text-sm font-medium cursor-pointer transition-colors"
					onClick={() => setIsModalOpen(true)}
				>
					<Plus size={16} className="text-white" />
					New Technician
				</button>
			</PageHeader>
			<PageControls
				className="mb-4"
				left={
					<SearchBar
						paramKey="search"
						placeholder="Search technicians..."
						onValueChange={setSearchInput}
					/>
				}
				middle={
					<StatusFilter
						paramKey="status"
						placeholder="Status"
						options={[
							{ value: "Available", label: "Available" },
							{ value: "Busy", label: "Busy" },
							{ value: "Break", label: "Break" },
							{ value: "Offline", label: "Offline" },
						]}
					/>
				}
				right={<ViewToggle value={viewMode} onChange={setViewMode} />}
			/>

			{/*Filter Bar with Chips*/}
			<FilterChips
				filters={[
					searchFilter
						? { label: `Search: "${searchFilter}"`, color: "purple" as const, onRemove: () => removeFilter("search") }
						: null,
				]}
				resultCount={filteredTechnicians.length}
				onClearAll={clearAllFilters}
			/>

			{/* Loading State */}
			{isFetchLoading && (
				<div className="w-full h-[400px] flex flex-col justify-center items-center">
					<LoadSvg className="w-12 h-12 mb-3" />
					<h1 className="text-center text-xl mt-3">Please wait...</h1>
				</div>
			)}

			{/* Error State */}
			{fetchError && !isFetchLoading && (
				<div className="w-full h-[400px] flex flex-col justify-center items-center">
					<ErrSvg className="w-15 h-15 mb-1" />
					<h1 className="text-center text-xl mt-1">
						An error has occurred.
					</h1>
					<h2 className="text-center text-zinc-500 mt-1">
						{fetchError.message}
					</h2>
				</div>
			)}

			{/* Empty State */}
			{!isFetchLoading && !fetchError && filteredTechnicians?.length === 0 && (
				<div className="w-full h-[400px] flex flex-col justify-center items-center">
					<BoxSvg className="w-15 h-15 mb-1" />
					<h1 className="text-center text-xl mt-1">
						{activeSearch ? "No technicians found." : "No technicians yet."}
					</h1>
					{activeSearch && (
						<p className="text-center text-zinc-500 mt-2">
							Try adjusting your search terms
						</p>
					)}
				</div>
			)}

			{/* Technician Cards Grid */}
			{!isFetchLoading && !fetchError && filteredTechnicians.length > 0 && (
				<>
					<div
						className={
							viewMode === "card"
								? "grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(288px,1fr))]"
								: "flex flex-col gap-4"
						}
					>
						{pagedTechnicians.map((technician) => (
							<TechnicianCard
								key={technician.id}
								technician={technician}
								onClick={() => navigate(`/dispatch/technicians/${technician.id}`)}
								viewMode={viewMode}
							/>
						))}
					</div>

					{/* Pagination footer */}
					<div className="flex flex-wrap items-center justify-between gap-4 mt-5 pt-4 border-t border-zinc-800">
						<div className="flex items-center gap-4">
							<span className="text-sm text-zinc-400">
								{perPage === 0
									? `Showing all ${filteredTechnicians.length}`
									: `Showing ${(currentPage - 1) * perPage + 1}–${Math.min(currentPage * perPage, filteredTechnicians.length)} of ${filteredTechnicians.length}`}
							</span>
							<div className="flex items-center gap-1 bg-zinc-800 border border-zinc-700 rounded-md p-1">
								{[12, 24, 48].map((n) => (
									<button
										key={n}
										onClick={() => setPerPage(n)}
										className={`px-3 py-1.5 rounded text-sm font-medium cursor-pointer transition-colors ${
											perPage === n ? "bg-zinc-600 text-white" : "text-zinc-400 hover:text-white"
										}`}
									>
										{n}
									</button>
								))}
								<button
									onClick={() => setPerPage(0)}
									className={`px-3 py-1.5 rounded text-sm font-medium cursor-pointer transition-colors ${
										perPage === 0 ? "bg-zinc-600 text-white" : "text-zinc-400 hover:text-white"
									}`}
								>
									All
								</button>
							</div>
						</div>

						{perPage !== 0 && totalPages > 1 && (
							<div className="flex items-center gap-1.5">
								<button
									onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
									disabled={currentPage === 1}
									className="p-2 rounded-md bg-zinc-800 border border-zinc-700 text-zinc-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
								>
									<ChevronLeft size={16} />
								</button>
								{Array.from({ length: totalPages }, (_, i) => i + 1)
									.filter((p) => p === 1 || p === totalPages || Math.abs(p - currentPage) <= 1)
									.reduce<(number | "...")[]>((acc, p, i, arr) => {
										if (i > 0 && p - (arr[i - 1] as number) > 1) acc.push("...");
										acc.push(p);
										return acc;
									}, [])
									.map((p, i) =>
										p === "..." ? (
											<span key={`ellipsis-${i}`} className="px-1.5 text-zinc-500 text-sm">…</span>
										) : (
											<button
												key={p}
												onClick={() => setCurrentPage(p as number)}
												className={`min-w-[36px] px-2.5 py-1.5 rounded-md text-sm border transition-colors ${
													currentPage === p
														? "bg-blue-600 border-blue-600 text-white"
														: "bg-zinc-800 border-zinc-700 text-zinc-400 hover:text-white"
												}`}
											>
												{p}
											</button>
										)
									)}
								<button
									onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
									disabled={currentPage === totalPages}
									className="p-2 rounded-md bg-zinc-800 border border-zinc-700 text-zinc-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
								>
									<ChevronRight size={16} />
								</button>
							</div>
						)}
					</div>
				</>
			)}
			<CreateTechnician
				isModalOpen={isModalOpen}
				setIsModalOpen={setIsModalOpen}
				createTechnician={async (input) => {
					const newTechnician = await createTechnician(input);

					if (!newTechnician?.id)
						throw new Error(
							"Technician creation failed: no ID returned"
						);

					return newTechnician.id;
				}}
			/>
		</div>
	);
}