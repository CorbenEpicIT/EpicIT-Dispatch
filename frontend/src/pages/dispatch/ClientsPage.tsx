import { useState, useRef, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { Plus, MoreVertical, Upload, Download } from "lucide-react";
import { useAllClientsQuery, useCreateClientMutation } from "../../hooks/useClients";
import CreateClient from "../../components/clients/CreateClient";
import ClientCard from "../../components/clients/ClientCard";
import LoadSvg from "../../assets/icons/loading.svg?react";
import BoxSvg from "../../assets/icons/box.svg?react";
import ErrSvg from "../../assets/icons/error.svg?react";
import SearchBar from "../../components/ui/SearchBar";
import FilterChips, { type FilterChip } from "../../components/ui/FilterChips";
import ViewToggle from "../../components/ui/ViewToggle";
import PageControls from "../../components/ui/PageControls";
import StatusFilter from "../../components/ui/StatusFilter";
import PageHeader from "../../components/ui/PageHeader";

export default function ClientsPage() {
	const navigate = useNavigate();
	const location = useLocation();
	const {
		data: clients,
		isLoading: isFetchLoading,
		error: fetchError,
	} = useAllClientsQuery();
	const { mutateAsync: createClient } = useCreateClientMutation();
	const [searchInput, setSearchInput] = useState("");
	const [viewMode, setViewMode] = useState<"card" | "list">("card");
	const [isModalOpen, setIsModalOpen] = useState(false);
	const [showActionsMenu, setShowActionsMenu] = useState(false);
	const menuRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		const handleOutsideClick = (e: MouseEvent) => {
			if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
				setShowActionsMenu(false);
			}
		};
		if (showActionsMenu) {
			document.addEventListener("mousedown", handleOutsideClick);
			return () => document.removeEventListener("mousedown", handleOutsideClick);
		}
	}, [showActionsMenu]);

	const queryParams = new URLSearchParams(location.search);
	const searchFilter = queryParams.get("search");
	const statusFilter = queryParams.get("status");

	// Use searchInput for instant preview, searchFilter for committed filter
	const activeSearch = searchInput || searchFilter;

	const filteredClients = clients
		?.filter((c) => {
			if (activeSearch) {
				const searchLower = activeSearch.toLowerCase();
				const matchesSearch =
					c.name.toLowerCase().includes(searchLower) ||
					c.address?.toLowerCase().includes(searchLower);
				if (!matchesSearch) return false;
			}

			if (statusFilter === "active") {
				return c.is_active === true;
			}
			if (statusFilter === "inactive") {
				return c.is_active === false;
			}

			return true;
		})
		.sort((a, b) => {
			// Sort active clients first
			if (a.is_active === b.is_active) return 0;
			return a.is_active ? -1 : 1;
		});

	const removeFilter = () => {
		const newParams = new URLSearchParams(location.search);
		newParams.delete("search");
		setSearchInput("");
		navigate(
			`/dispatch/clients${newParams.toString() ? `?${newParams.toString()}` : ""}`
		);
	};

	const clearAllFilters = () => {
		setSearchInput("");
		const next = new URLSearchParams(location.search);
		next.delete("search");
		navigate(`/dispatch/clients${next.toString() ? `?${next.toString()}` : ""}`);
	};

	return (
		<div className="text-white">
			<PageHeader title="Clients">
				<button
					className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-md text-sm font-medium cursor-pointer transition-colors"
					onClick={() => setIsModalOpen(true)}
				>
					<Plus size={16} className="text-white" />
					New Client
				</button>
				<div className="relative" ref={menuRef}>
					<button
						onClick={() => setShowActionsMenu(!showActionsMenu)}
						aria-label="More actions"
						aria-expanded={showActionsMenu}
						aria-haspopup="menu"
						className="flex items-center justify-center p-2.5 hover:bg-zinc-800 rounded-md transition-colors border border-zinc-700 hover:border-zinc-600"
					>
						<MoreVertical size={20} className="text-white" />
					</button>
					{showActionsMenu && (
						<div className="absolute right-0 mt-2 w-56 bg-zinc-950 border border-zinc-600 rounded-lg shadow-2xl shadow-black/50 z-50">
							<div className="py-1">
								<div className="px-4 py-2 text-xs text-zinc-500 italic border-b border-zinc-800 mb-1">
									Options yet to be
									implemented
								</div>
								<button
									onClick={() =>
										setShowActionsMenu(
											false
										)
									}
									className="w-full px-4 py-2 text-left text-sm hover:bg-zinc-800/70 transition-colors flex items-center gap-2"
								>
									<Upload size={16} />
									Import Clients
								</button>
								<button
									onClick={() =>
										setShowActionsMenu(
											false
										)
									}
									className="w-full px-4 py-2 text-left text-sm hover:bg-zinc-800/70 transition-colors flex items-center gap-2"
								>
									<Download size={16} />
									Export Clients
								</button>
							</div>
						</div>
					)}
				</div>
			</PageHeader>

			<PageControls
				className="mb-4"
				left={
					<SearchBar
						paramKey="search"
						placeholder="Search clients..."
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

			{/* Single Filter Bar with Chips */}
			<FilterChips
				filters={[
					searchFilter
						? {
								label: `Search: "${searchFilter}"`,
								color: "purple" as const,
								onRemove: removeFilter,
							}
						: null,
				]}
				resultCount={filteredClients?.length ?? 0}
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
			{!isFetchLoading && !fetchError && filteredClients?.length === 0 && (
				<div className="w-full h-[400px] flex flex-col justify-center items-center">
					<BoxSvg className="w-15 h-15 mb-1" />
					<h1 className="text-center text-xl mt-1">
						{activeSearch
							? "No clients found."
							: "No clients yet."}
					</h1>
					{activeSearch && (
						<p className="text-center text-zinc-500 mt-2">
							Try adjusting your search terms
						</p>
					)}
				</div>
			)}

			{/* Client Cards - Flex Layout */}
			{!isFetchLoading &&
				!fetchError &&
				filteredClients &&
				filteredClients.length > 0 && (
					<div
						className={
							viewMode === "card"
								? "flex flex-wrap gap-4"
								: "flex flex-col gap-2"
						}
					>
						{filteredClients.map((client) => (
							<ClientCard
								key={client.id}
								client={client}
								viewMode={viewMode}
								onClick={() =>
									navigate(
										`/dispatch/clients/${client.id}`
									)
								}
							/>
						))}
					</div>
				)}

			<CreateClient
				isModalOpen={isModalOpen}
				setIsModalOpen={setIsModalOpen}
				createClient={async (input) => {
					const newClient = await createClient(input);

					if (!newClient?.id)
						throw new Error(
							"Client creation failed: no ID returned"
						);

					return newClient.id;
				}}
			/>
		</div>
	);
}
