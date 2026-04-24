import { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { Search, Plus, Share, X } from "lucide-react";
import { useAllTechniciansQuery, useCreateTechnicianMutation } from "../../hooks/useTechnicians";
import CreateTechnician from "../../components/technicians/CreateTechnician";
import TechnicianCard from "../../components/technicians/TechnicianCard";
import LoadSvg from "../../assets/icons/loading.svg?react";
import BoxSvg from "../../assets/icons/box.svg?react";
import ErrSvg from "../../assets/icons/error.svg?react";

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

	const queryParams = new URLSearchParams(location.search);
	const searchFilter = queryParams.get('search');
	const statusFilter = queryParams.get('status');

	useEffect(() => {
		setSearchInput(searchFilter || "");
	}, [searchFilter]);

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

	const handleSearchSubmit = (e: React.FormEvent) => {
		e.preventDefault();
		const newParams = new URLSearchParams(location.search);
		if (searchInput.trim()) {
			newParams.set('search', searchInput.trim());
		} else {
			newParams.delete('search');
		}
		navigate(`/dispatch/technicians?${newParams.toString()}`);
	};

	const removeFilter = (filterType: 'search' | 'status') => {
		const newParams = new URLSearchParams(location.search);
		newParams.delete(filterType);
		if (filterType === 'search') {
			setSearchInput("");
		}
		navigate(`/dispatch/technicians${newParams.toString() ? `?${newParams.toString()}` : ''}`);
	};

	const clearAllFilters = () => {
		setSearchInput("");
		navigate('/dispatch/technicians');
	};

	const hasFilters = searchFilter || statusFilter;

	const statusCounts = technicians?.reduce((acc, t) => {
		acc[t.status] = (acc[t.status] || 0) + 1;
		return acc;
	}, {} as Record<string, number>) || {};

	return (
		<div className="text-white">
			<div className="flex flex-wrap items-center justify-between gap-4 mb-2">
				<div>
					<h2 className="text-2xl font-semibold">Technicians</h2>
					<div className="flex gap-3 text-xs">
						<span className="text-green-400">
							● Available: {statusCounts.Available || 0}
						</span>
						<span className="text-yellow-400">
							● Busy: {statusCounts.Busy || 0}
						</span>
						<span className="text-blue-400">
							● Break: {statusCounts.Break || 0}
						</span>
						<span className="text-red-400">
							● Offline: {statusCounts.Offline || 0}
						</span>
					</div>
				</div>

				<div className="flex gap-2 text-nowrap">
					<form onSubmit={handleSearchSubmit} className="relative w-full min-w-[250px]">
						<Search
							size={18}
							className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"
						/>
						<input
							type="text"
							placeholder="Search technicians..."
							value={searchInput}
							onChange={(e) => setSearchInput(e.target.value)}
							className="w-full pl-11 pr-3 py-2 rounded-md bg-zinc-800 border border-zinc-700 text-sm 
							text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-2 
							focus:ring-blue-500"
						/>
					</form>

					<button
						className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-md text-sm font-medium cursor-pointer transition-colors"
						onClick={() => setIsModalOpen(true)}
					>
						<Plus size={16} className="text-white" />
						New Technician
					</button>

					<button className="flex items-center gap-2 px-4 py-2 bg-zinc-700 hover:bg-zinc-600 rounded-md text-sm font-medium transition-colors">
						<Share size={16} className="text-white" />
						Export
					</button>
				</div>
			</div>

			{/*Filter Bar with Chips*/}
			{hasFilters && (
				<div className="mb-2 p-3 bg-zinc-800 rounded-lg border border-zinc-700">
					<div className="flex items-center justify-between">
						<div className="flex items-center gap-2 flex-wrap">
							<span className="text-sm text-zinc-400">Active filters:</span>
							
							{/* Search Filter Chip */}
							{searchFilter && (
								<div className="flex items-center gap-2 px-3 py-1.5 bg-purple-600/20 border border-purple-500/30 rounded-md">
									<span className="text-sm text-purple-300">
										Search: <span className="font-medium text-white">"{searchFilter}"</span>
									</span>
									<button
										onClick={() => removeFilter('search')}
										className="text-purple-300 hover:text-white transition-colors"
										aria-label="Remove search filter"
									>
										<X size={14} />
									</button>
								</div>
							)}

							{/* Status Filter Chip */}
							{statusFilter && (
								<div className="flex items-center gap-2 px-3 py-1.5 bg-green-600/20 border border-green-500/30 rounded-md">
									<span className="text-sm text-green-300">
										Status: <span className="font-medium text-white capitalize">{statusFilter}</span>
									</span>
									<button
										onClick={() => removeFilter('status')}
										className="text-green-300 hover:text-white transition-colors"
										aria-label="Remove status filter"
									>
										<X size={14} />
									</button>
								</div>
							)}

							{/* Results Count */}
							<span className="text-sm text-zinc-500">
								• {filteredTechnicians?.length || 0} {filteredTechnicians?.length === 1 ? 'result' : 'results'}
							</span>
						</div>

						{/* Clear All Button */}
						<button
							onClick={clearAllFilters}
							className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-red-400 hover:text-red-300 hover:bg-zinc-700/50 rounded-md transition-colors"
						>
							Clear All
							<X size={14} />
						</button>
					</div>
				</div>
			)}

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
			{!isFetchLoading && !fetchError && filteredTechnicians && filteredTechnicians.length > 0 && (
				<div className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(288px,1fr))]">
					{filteredTechnicians.map((technician) => (
						<TechnicianCard
							key={technician.id}
							technician={technician}
							onClick={() => { navigate(`/dispatch/technicians/${technician.id}`); }}
						/>
					))}
				</div>
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