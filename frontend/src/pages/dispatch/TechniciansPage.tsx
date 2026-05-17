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
import FilterChips from "../../components/ui/FilterChips";
import ViewToggle from "../../components/ui/ViewToggle";
import PageControls from "../../components/ui/PageControls";
import StatusFilter from "../../components/ui/StatusFilter";
import PageHeader from "../../components/ui/PageHeader";
import { useMultiSearch } from "../../hooks/useMultiSearch";

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

	const { terms, addTerm, removeTerm, clearAll, duplicateTerm } = useMultiSearch("search");
	const termsKey = terms.join(" ");

	const queryParams = new URLSearchParams(location.search);
	const statusFilter = queryParams.get("status");

	useEffect(() => {
		setCurrentPage(1);
	}, [termsKey, searchInput, statusFilter, perPage]);

	const activeTerms = searchInput.trim() ? [...terms, searchInput.trim()] : terms;

	const filteredTechnicians =
		technicians
			?.filter((tech) => {
				if (activeTerms.length > 0) {
					const matches = activeTerms.every((term) => {
						const lower = term.toLowerCase();
						return (
							tech.name.toLowerCase().includes(lower) ||
							(tech.email
								?.toLowerCase()
								.includes(lower) ??
								false) ||
							(tech.phone
								?.toLowerCase()
								.includes(lower) ??
								false) ||
							(tech.title
								?.toLowerCase()
								.includes(lower) ??
								false)
						);
					});
					if (!matches) return false;
				}
				if (statusFilter)
					return (
						tech.status.toLowerCase() ===
						statusFilter.toLowerCase()
					);
				return true;
			})
			.sort((a, b) => {
				const statusOrder: Record<string, number> = {
					Available: 0,
					Working: 1,
					EnRoute: 2,
					OnSite: 3,
					Paused: 4,
					WrappingUp: 5,
					Break: 6,
					Offline: 7,
				};
				return (statusOrder[a.status] ?? 8) - (statusOrder[b.status] ?? 8);
			}) ?? [];

	const totalPages = perPage === 0 ? 1 : Math.ceil(filteredTechnicians.length / perPage);
	const pagedTechnicians =
		perPage === 0
			? filteredTechnicians
			: filteredTechnicians.slice(
					(currentPage - 1) * perPage,
					currentPage * perPage
				);

	const statusCounts =
		technicians?.reduce(
			(acc, t) => {
				acc[t.status] = (acc[t.status] || 0) + 1;
				return acc;
			},
			{} as Record<string, number>
		) || {};

	return (
		<div className="text-white">
			<PageHeader
				title="Technicians"
				subtitle={
					<div className="flex flex-wrap gap-3 text-xs">
						<span className="text-success-text">● Available: {statusCounts.Available || 0}</span>
						<span className="text-reviewing-text">● Working: {statusCounts.Working || 0}</span>
						<span className="text-sky-400">● En Route: {statusCounts.EnRoute || 0}</span>
						<span className="text-warning-text">● On Site: {statusCounts.OnSite || 0}</span>
						<span className="text-orange-400">● Paused: {statusCounts.Paused || 0}</span>
						<span className="text-text-tertiary">● Offline: {statusCounts.Offline || 0}</span>
					</div>
				}
			>
				<button
					className="flex items-center gap-2 px-4 py-2 bg-primary-hover hover:bg-blue-700 rounded-md text-sm font-medium cursor-pointer transition-colors"
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
						onSubmit={addTerm}
					/>
				}
				middle={
					<StatusFilter
						paramKey="status"
						placeholder="Status"
						options={[
							{ value: "Available", label: "Available" },
							{ value: "Working", label: "Working" },
							{ value: "EnRoute", label: "En Route" },
							{ value: "OnSite", label: "On Site" },
							{ value: "Paused", label: "Paused" },
							{ value: "WrappingUp", label: "Wrapping Up" },
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
					...terms.map((term) => ({
						label: `Search: "${term}"`,
						color: "purple" as const,
						onRemove: () => removeTerm(term),
						highlighted: duplicateTerm === term,
					})),
				]}
				resultCount={filteredTechnicians.length}
				onClearAll={() => {
					clearAll();
					setSearchInput("");
				}}
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
					<h2 className="text-center text-text-muted mt-1">
						{fetchError.message}
					</h2>
				</div>
			)}

			{/* Empty State */}
			{!isFetchLoading && !fetchError && filteredTechnicians?.length === 0 && (
				<div className="w-full h-[400px] flex flex-col justify-center items-center">
					<BoxSvg className="w-15 h-15 mb-1" />
					<h1 className="text-center text-xl mt-1">
						{activeTerms.length > 0
							? "No technicians found."
							: "No technicians yet."}
					</h1>
					{activeTerms.length > 0 && (
						<p className="text-center text-text-muted mt-2">
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
								onClick={() =>
									navigate(
										`/dispatch/technicians/${technician.id}`
									)
								}
								viewMode={viewMode}
							/>
						))}
					</div>

					{/* Pagination footer */}
					<div className="flex flex-wrap items-center justify-between gap-4 mt-5 pt-4 border-t border-border-subtle">
						<div className="flex items-center gap-4">
							<span className="text-sm text-text-tertiary">
								{perPage === 0
									? `Showing all ${filteredTechnicians.length}`
									: `Showing ${(currentPage - 1) * perPage + 1}–${Math.min(currentPage * perPage, filteredTechnicians.length)} of ${filteredTechnicians.length}`}
							</span>
							<div className="flex items-center gap-1 bg-surface border border-border rounded-md p-1">
								{[12, 24, 48].map((n) => (
									<button
										key={n}
										onClick={() =>
											setPerPage(
												n
											)
										}
										className={`px-3 py-1.5 rounded text-sm font-medium cursor-pointer transition-colors ${
											perPage ===
											n
												? "bg-zinc-600 text-white"
												: "text-text-tertiary hover:text-white"
										}`}
									>
										{n}
									</button>
								))}
								<button
									onClick={() =>
										setPerPage(0)
									}
									className={`px-3 py-1.5 rounded text-sm font-medium cursor-pointer transition-colors ${
										perPage === 0
											? "bg-zinc-600 text-white"
											: "text-text-tertiary hover:text-white"
									}`}
								>
									All
								</button>
							</div>
						</div>

						{perPage !== 0 && totalPages > 1 && (
							<div className="flex items-center gap-1.5">
								<button
									onClick={() =>
										setCurrentPage(
											(p) =>
												Math.max(
													1,
													p -
														1
												)
										)
									}
									disabled={currentPage === 1}
									className="p-2 rounded-md bg-surface border border-border text-text-tertiary hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
								>
									<ChevronLeft size={16} />
								</button>
								{Array.from(
									{ length: totalPages },
									(_, i) => i + 1
								)
									.filter(
										(p) =>
											p === 1 ||
											p ===
												totalPages ||
											Math.abs(
												p -
													currentPage
											) <= 1
									)
									.reduce<(number | "...")[]>(
										(
											acc,
											p,
											i,
											arr
										) => {
											if (
												i >
													0 &&
												p -
													(arr[
														i -
															1
													] as number) >
													1
											)
												acc.push(
													"..."
												);
											acc.push(p);
											return acc;
										},
										[]
									)
									.map((p, i) =>
										p === "..." ? (
											<span
												key={`ellipsis-${i}`}
												className="px-1.5 text-text-muted text-sm"
											>
												…
											</span>
										) : (
											<button
												key={
													p
												}
												onClick={() =>
													setCurrentPage(
														p as number
													)
												}
												className={`min-w-[36px] px-2.5 py-1.5 rounded-md text-sm border transition-colors ${
													currentPage ===
													p
														? "bg-primary-hover border-blue-600 text-white"
														: "bg-surface border-border text-text-tertiary hover:text-white"
												}`}
											>
												{p}
											</button>
										)
									)}
								<button
									onClick={() =>
										setCurrentPage(
											(p) =>
												Math.min(
													totalPages,
													p +
														1
												)
										)
									}
									disabled={
										currentPage ===
										totalPages
									}
									className="p-2 rounded-md bg-surface border border-border text-text-tertiary hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
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
