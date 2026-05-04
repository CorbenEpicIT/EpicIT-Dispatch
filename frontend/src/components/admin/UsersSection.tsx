import { useState, useEffect, Fragment } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { Plus, ChevronLeft, ChevronRight } from "lucide-react";
import { useAllTechniciansQuery, useCreateTechnicianMutation } from "../../hooks/useTechnicians";
import CreateTechnician from "../../components/technicians/CreateTechnician";
import EditTechnician from "../../components/technicians/EditTechnician";
import EditDispatcher from "../../components/dispatchers/EditDispatcher";
import type { Technician } from "../../types/technicians";
import type { Dispatcher } from "../../types/dispatchers";
import TechnicianCard from "../../components/technicians/TechnicianCard";
import LoadSvg from "../../assets/icons/loading.svg?react";
import BoxSvg from "../../assets/icons/box.svg?react";
import ErrSvg from "../../assets/icons/error.svg?react";
import { useAllDispatchersQuery, useCreateDispatcherMutation } from "../../hooks/useDispatchers";
import { DispatcherCard } from "../../components/dispatchers/DispatcherCard";
import CreateDispatcher from "../../components/dispatchers/CreateDispatcher";
import SearchBar from "../../components/ui/SearchBar";
import ViewToggle from "../../components/ui/ViewToggle";
import FilterChips, { type FilterChip } from "../../components/ui/FilterChips";
import PageHeader from "../../components/ui/PageHeader";


type viewMode = "list" | "card";

export default function UsersSection() {
    const navigate = useNavigate();
	const location = useLocation();
	const {
		data: technicians,
		isLoading: isTechniciansLoading,
		error: techniciansFetchError,
	} = useAllTechniciansQuery();
	const {
		data: dispatchers,
		isLoading: isDispatchersLoading,
		error: dispatchersFetchError,
	} = useAllDispatchersQuery();
	const fetchError = techniciansFetchError || dispatchersFetchError;
	const isFetchLoading = isTechniciansLoading || isDispatchersLoading;
	const { mutateAsync: createTechnician } = useCreateTechnicianMutation();
	const { mutateAsync: createDispatcher } = useCreateDispatcherMutation();
	const [searchInput, setSearchInput] = useState("");
	const [isTechModalOpen, setIsTechModalOpen] = useState(false);
	const [isEditTechModalOpen, setIsEditTechModalOpen] = useState(false);
	const [selectedTechnician, setSelectedTechnician] = useState<Technician | null>(null);
	const [selectedDispatcher, setSelectedDispatcher] = useState<Dispatcher | null>(null);
    const [isDispatcherModalOpen, setIsDispatcherModalOpen] = useState(false);
	const [isEditDispatcherModalOpen, setIsEditDispatcherModalOpen] = useState(false);
    const [showTechnicians, setShowTechnicians] = useState(true);
    const [showDispatchers, setShowDispatchers] = useState(true);
	const [viewMode, setViewMode] = useState<viewMode>("card");
	const [perPage, setPerPage] = useState(12);
	const [currentPage, setCurrentPage] = useState(1);

	const queryParams = new URLSearchParams(location.search);
	const searchFilter = queryParams.get('search');
	const statusFilter = queryParams.get('status');

	useEffect(() => {
		setCurrentPage(1);
	}, [searchInput, searchFilter, statusFilter, showTechnicians, showDispatchers, perPage]);

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
		});

	const filteredDispatchers = dispatchers
		?.filter((d) => {
			if (activeSearch) {
				const searchLower = activeSearch.toLowerCase();
				const matchesSearch =
					d.name.toLowerCase().includes(searchLower) ||
					d.email?.toLowerCase().includes(searchLower) ||
					d.phone?.toLowerCase().includes(searchLower) ||
					d.title?.toLowerCase().includes(searchLower);
				if (!matchesSearch) return false;
			}
			return true;
		})
		.sort((a, b) => {
			const sortA = a.name.toLowerCase();
			const sortB = b.name.toLowerCase();
			return sortA.localeCompare(sortB);
		});
	const filteredUsers = [
		...(filteredTechnicians || []).map(t => ({ ...t, userType: "technician" as const })),
		...(filteredDispatchers || []).map(d => ({ ...d, userType: "dispatcher" as const })),
	].sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()));

	const displayUsers = filteredUsers.filter(u =>
		(u.userType === "technician" && showTechnicians) ||
		(u.userType === "dispatcher" && showDispatchers)
	);
	const totalPages = perPage === 0 ? 1 : Math.ceil(displayUsers.length / perPage);
	const pagedUsers = perPage === 0 ? displayUsers : displayUsers.slice((currentPage - 1) * perPage, currentPage * perPage);

	const removeFilter = (filterType: 'search' | 'status') => {
		const newParams = new URLSearchParams(location.search);
		newParams.delete(filterType);
		if (filterType === 'search') {
			setSearchInput("");
		}
		navigate(`/dispatch/admin${newParams.toString() ? `?${newParams.toString()}` : ''}`);
	};

	const clearAllFilters = () => {
		setSearchInput("");
		setShowTechnicians(true);
		setShowDispatchers(true);
		const next = new URLSearchParams(location.search);
		next.delete("search");
		navigate(`/dispatch/admin${next.toString() ? `?${next.toString()}` : ""}`);
	};

    return (
        <div className="text-white">
			<PageHeader title="Administration">
				<button
					className="flex items-center gap-2 px-3 py-2 bg-blue-600 hover:bg-blue-700 rounded-md text-sm font-medium cursor-pointer transition-colors"
					onClick={() => setIsTechModalOpen(true)}
				>
					<Plus size={15} />
					New Technician
				</button>
				<button
					className="flex items-center gap-2 px-3 py-2 bg-blue-600 hover:bg-blue-700 rounded-md text-sm font-medium cursor-pointer transition-colors"
					onClick={() => setIsDispatcherModalOpen(true)}
				>
					<Plus size={15} />
					New Dispatcher
				</button>
			</PageHeader>

			{/* Controls row */}
			<div className="flex flex-wrap items-center gap-2 mb-4">
				<SearchBar
					paramKey="search"
					placeholder="Search users..."
					onValueChange={setSearchInput}
					className="flex-1 min-w-[200px]"
				/>

				<div className="h-8 w-px bg-zinc-700 hidden sm:block" />

				<div className="flex items-center gap-1 bg-zinc-800 border border-zinc-700 rounded-md p-1">
					<button
						onClick={() => setShowTechnicians(!showTechnicians)}
						className={`px-3 py-1 text-xs rounded font-medium cursor-pointer transition-colors ${
							showTechnicians ? "bg-blue-600 text-white" : "text-zinc-400 hover:text-white"
						}`}
					>
						Technicians
					</button>
					<button
						onClick={() => setShowDispatchers(!showDispatchers)}
						className={`px-3 py-1 text-xs rounded font-medium cursor-pointer transition-colors ${
							showDispatchers ? "bg-blue-600 text-white" : "text-zinc-400 hover:text-white"
						}`}
					>
						Dispatchers
					</button>
				</div>

				<div className="h-8 w-px bg-zinc-700 hidden sm:block" />

				<ViewToggle value={viewMode} onChange={setViewMode} />
			</div>

			<FilterChips
				filters={[
					searchFilter
						? { label: `Search: "${searchFilter}"`, color: "purple" as const, onRemove: () => removeFilter("search") }
						: null,
				]}
				resultCount={displayUsers.length}
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
			{!isFetchLoading && !fetchError && displayUsers.length === 0 && (
				<div className="w-full h-[400px] flex flex-col justify-center items-center">
					<BoxSvg className="w-15 h-15 mb-1" />
					<h1 className="text-center text-xl mt-1">
						{activeSearch ? "No users found." : "No users yet."}
					</h1>
					{activeSearch && (
						<p className="text-center text-zinc-500 mt-2">
							Try adjusting your search terms
						</p>
					)}
				</div>
			)}

			{/* Cards Grid */}
			{!isFetchLoading && !fetchError && displayUsers.length > 0 && (
				<>
					<div className={viewMode === "card" ?
						"grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(288px,1fr))]" : "flex flex-col gap-4"}>
						{pagedUsers.map((user) => (
							<Fragment key={user.id}>
								{user.userType === "technician" && (
									<TechnicianCard
										technician={user}
										onClick={() => navigate(`/dispatch/technicians/${user.id}`) }
										viewMode={viewMode}
										onEdit={(technician) => {
											setSelectedTechnician(technician);
											setIsEditTechModalOpen(true);
										}}
									/>
								)}
								{user.userType === "dispatcher" && (
									<DispatcherCard
										dispatcher={user}
										onClick={() => navigate(`/dispatch/dispatchers/${user.id}`)}
										viewMode={viewMode}
										onEdit={(dispatcher) => {
											setSelectedDispatcher(dispatcher);
											setIsEditDispatcherModalOpen(true);
										}}
									/>
								)}
							</Fragment>
						))}
					</div>

					{/* Pagination footer */}
					<div className="flex flex-wrap items-center justify-between gap-4 mt-5 pt-4 border-t border-zinc-800">
						{/* Left: count + per-page */}
						<div className="flex items-center gap-4">
							<span className="text-sm text-zinc-400">
								{perPage === 0
									? `Showing all ${displayUsers.length}`
									: `Showing ${(currentPage - 1) * perPage + 1}–${Math.min(currentPage * perPage, displayUsers.length)} of ${displayUsers.length}`}
							</span>
							<div className="flex items-center gap-1 bg-zinc-800 border border-zinc-700 rounded-md p-.75">
								{[12, 24, 48].map(n => (
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

						{/* Right: page navigation */}
						{perPage !== 0 && totalPages > 1 && (
							<div className="flex items-center gap-1.5">
								<button
									onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
									disabled={currentPage === 1}
									className="p-2 rounded-md bg-zinc-800 border border-zinc-700 text-zinc-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
								>
									<ChevronLeft size={16} />
								</button>
								{Array.from({ length: totalPages }, (_, i) => i + 1)
									.filter(p => p === 1 || p === totalPages || Math.abs(p - currentPage) <= 1)
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
									onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
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
				isModalOpen={isTechModalOpen}
				setIsModalOpen={setIsTechModalOpen}
				createTechnician={async (input) => {
					const newTechnician = await createTechnician(input);

					if (!newTechnician?.id)
						throw new Error(
							"Technician creation failed: no ID returned"
						);

					return newTechnician.id;
				}}
			/>
			{selectedTechnician && (
				<EditTechnician
					isOpen={isEditTechModalOpen}
					onClose={() => { setIsEditTechModalOpen(false); setSelectedTechnician(null); }}
					technician={selectedTechnician}
				/>
			)}
			<CreateDispatcher
				isModalOpen={isDispatcherModalOpen}
				setIsModalOpen={setIsDispatcherModalOpen}
				createDispatcher={async (input) => {
					const newDispatcher = await createDispatcher(input);

					if (!newDispatcher?.id)
						throw new Error(
							"Dispatcher creation failed: no ID returned"
						);
					return newDispatcher.id;
				}}
			/>
			{selectedDispatcher && (
				<EditDispatcher
					isOpen={isEditDispatcherModalOpen}
					onClose={() => { setIsEditDispatcherModalOpen(false); setSelectedDispatcher(null); }}
					dispatcher={selectedDispatcher}
				/>
			)}
		</div>
    );
}
