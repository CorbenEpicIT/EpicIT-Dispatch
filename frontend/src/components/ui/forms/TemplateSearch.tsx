import { useState, useMemo, useCallback } from "react";
import { Search, X, BookOpen, ChevronRight, Users, Trash2 } from "lucide-react";

export interface TemplateSearchClient {
	id: string;
	name: string;
}

export interface TemplateSearchResult {
	id: string;
	title: string;
	subtitle?: string;
	detail?: string;
	badge?: string;
	badgeColor?: string;
	value?: string;
	createdAt?: string;
	clientId?: string;
	clientName?: string;
	/** When true, a delete button is rendered on this row */
	isDeletable?: boolean;
}

export interface TemplateSearchScopeToggle {
	thisLabel: string;
	anyLabel: string;
	isThisScope: boolean;
	onToggle: () => void;
}

interface TemplateSearchProps {
	heading?: string;
	placeholder?: string;
	results: TemplateSearchResult[];
	clients: TemplateSearchClient[];
	isLoading?: boolean;
	onSelect: (id: string) => void;
	onClose: () => void;
	onDelete?: (id: string) => void;
	isDeletingId?: string | null;
	scopeToggle?: TemplateSearchScopeToggle;
	clientFilter?: string;
	onClientFilterChange?: (clientId: string) => void;
}

function DeleteButton({
	id,
	onDelete,
	isDeleting,
}: {
	id: string;
	onDelete: (id: string) => void;
	isDeleting: boolean;
}) {
	const [armed, setArmed] = useState(false);

	const handleClick = useCallback(
		(e: React.MouseEvent) => {
			e.stopPropagation(); // don't trigger row select
			if (armed) {
				onDelete(id);
				setArmed(false);
			} else {
				setArmed(true);
			}
		},
		[armed, id, onDelete]
	);

	const handleBlur = useCallback(() => {
		// Small delay so a rapid second click still lands before reset
		setTimeout(() => setArmed(false), 150);
	}, []);

	return (
		<button
			type="button"
			onClick={handleClick}
			onBlur={handleBlur}
			disabled={isDeleting}
			title={armed ? "Click again to confirm delete" : "Delete draft"}
			className={`flex-shrink-0 flex items-center justify-center w-6 h-6 rounded transition-colors ${
				isDeleting
					? "text-zinc-600 cursor-not-allowed"
					: armed
						? "text-red-400 bg-red-500/15 border border-red-500/40 hover:bg-red-500/25"
						: "text-zinc-500 hover:text-red-400 hover:bg-zinc-700 border border-transparent"
			}`}
		>
			<Trash2 size={12} className={isDeleting ? "animate-pulse" : ""} />
		</button>
	);
}

export function TemplateSearch({
	heading = "Start from existing",
	placeholder = "Search by title, number, description...",
	results,
	clients,
	isLoading = false,
	onSelect,
	onClose,
	onDelete,
	isDeletingId = null,
	scopeToggle,
	clientFilter: controlledClientFilter,
	onClientFilterChange,
}: TemplateSearchProps) {
	const [query, setQuery] = useState("");
	const [clientQuery, setClientQuery] = useState("");

	// Uncontrolled fallback — used when parent does not pass clientFilter props
	const [internalClientFilter, setInternalClientFilter] = useState("");

	const isControlled =
		controlledClientFilter !== undefined && onClientFilterChange !== undefined;
	const clientFilter = isControlled ? controlledClientFilter : internalClientFilter;
	const setClientFilter = useCallback(
		(id: string) => {
			if (isControlled) {
				onClientFilterChange!(id);
			} else {
				setInternalClientFilter(id);
			}
		},
		[isControlled, onClientFilterChange]
	);

	const filteredClients = useMemo(() => {
		const q = clientQuery.toLowerCase().trim();
		if (!q) return clients;
		return clients.filter((c) => c.name.toLowerCase().includes(q));
	}, [clients, clientQuery]);

	const activeClientName = useMemo(
		() => clients.find((c) => c.id === clientFilter)?.name ?? "",
		[clients, clientFilter]
	);

	const filtered = useMemo(() => {
		const q = query.toLowerCase().trim();
		return results.filter((r) => {
			if (clientFilter && r.clientId !== clientFilter) return false;
			if (!q) return true;
			return (
				r.title.toLowerCase().includes(q) ||
				r.subtitle?.toLowerCase().includes(q) ||
				r.detail?.toLowerCase().includes(q) ||
				r.clientName?.toLowerCase().includes(q)
			);
		});
	}, [results, query, clientFilter]);

	const clearClientFilter = () => {
		setClientFilter("");
		setClientQuery("");
	};

	return (
		<div className="flex flex-col">
			{/* ── Header ── */}
			<div className="flex-shrink-0 space-y-2 pb-2 border-b border-zinc-800">
				{/* Row 1: heading */}
				<div className="flex items-center justify-between">
					<div className="flex items-center gap-2 min-w-0">
						<div className="w-7 h-7 rounded-lg bg-blue-500/10 border border-blue-500/20 flex items-center justify-center flex-shrink-0">
							<BookOpen
								size={14}
								className="text-blue-400"
							/>
						</div>
						<h3 className="text-sm font-semibold text-white">
							{heading}
						</h3>
						<span className="text-xs text-zinc-500 font-normal hidden sm:inline">
							— select one to pre-fill the form
						</span>
					</div>
				</div>

				{/* Row 2: search + scope toggle + client filter */}
				<div className="flex gap-2">
					<div className="relative flex-1 min-w-0">
						<Search
							size={14}
							className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-500 pointer-events-none"
						/>
						<input
							type="text"
							value={query}
							onChange={(e) => setQuery(e.target.value)}
							placeholder={placeholder}
							autoFocus
							className="w-full h-[34px] pl-8 pr-8 bg-zinc-900 border border-zinc-700 rounded text-sm text-white placeholder-zinc-500 focus:border-blue-500 focus:outline-none transition-colors"
						/>
						{query && (
							<button
								type="button"
								onClick={() => setQuery("")}
								className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300 transition-colors"
							>
								<X size={12} />
							</button>
						)}
					</div>

					{scopeToggle && (
						<button
							type="button"
							onClick={scopeToggle.onToggle}
							className={`flex-shrink-0 h-[34px] px-3 rounded text-xs font-medium border transition-colors ${
								scopeToggle.isThisScope
									? "bg-blue-500/15 border-blue-500/40 text-blue-300 hover:bg-blue-500/25"
									: "bg-zinc-800 border-zinc-700 text-zinc-400 hover:text-zinc-200 hover:border-zinc-600"
							}`}
							title={
								scopeToggle.isThisScope
									? "Showing this job only — click to show all jobs"
									: "Showing all jobs — click to show this job only"
							}
						>
							{scopeToggle.isThisScope
								? scopeToggle.thisLabel
								: scopeToggle.anyLabel}
						</button>
					)}

					{clients.length > 0 &&
						(!scopeToggle || !scopeToggle.isThisScope) && (
							<div className="relative flex-shrink-0 w-44">
								{clientFilter ? (
									<div className="flex items-center h-[34px] px-2.5 gap-1.5 bg-blue-500/10 border border-blue-500/30 rounded text-xs text-blue-300 font-medium">
										<Users
											size={12}
											className="flex-shrink-0 text-blue-400"
										/>
										<span className="truncate flex-1 min-w-0">
											{
												activeClientName
											}
										</span>
										<button
											type="button"
											onClick={
												clearClientFilter
											}
											className="flex-shrink-0 text-blue-400 hover:text-white transition-colors"
											title="Clear client filter"
										>
											<X
												size={
													12
												}
											/>
										</button>
									</div>
								) : (
									<>
										<Users
											size={14}
											className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-500 pointer-events-none"
										/>
										<input
											type="text"
											value={
												clientQuery
											}
											onChange={(
												e
											) =>
												setClientQuery(
													e
														.target
														.value
												)
											}
											placeholder="Filter by client…"
											className="w-full h-[34px] pl-8 pr-2 bg-zinc-900 border border-zinc-700 rounded text-sm text-white placeholder-zinc-500 focus:border-blue-500 focus:outline-none transition-colors"
										/>
										{clientQuery &&
											filteredClients.length >
												0 && (
												<div className="absolute top-full left-0 right-0 mt-1 bg-zinc-900 border border-zinc-700 rounded shadow-xl z-20 max-h-48 overflow-y-auto custom-scrollbar">
													{filteredClients.map(
														(
															c
														) => (
															<button
																key={
																	c.id
																}
																type="button"
																onClick={() => {
																	setClientFilter(
																		c.id
																	);
																	setClientQuery(
																		""
																	);
																}}
																className="w-full flex items-center px-3 py-2 text-sm text-zinc-200 hover:bg-zinc-800 hover:text-white transition-colors text-left"
															>
																{
																	c.name
																}
															</button>
														)
													)}
												</div>
											)}
										{clientQuery &&
											filteredClients.length ===
												0 && (
												<div className="absolute top-full left-0 right-0 mt-1 bg-zinc-900 border border-zinc-700 rounded shadow-xl z-20 px-3 py-2 text-xs text-zinc-500">
													No
													clients
													found
												</div>
											)}
									</>
								)}
							</div>
						)}
				</div>
			</div>

			{/* ── Results ── */}
			<div className="overflow-y-auto custom-scrollbar space-y-1 pt-2 pb-2 max-h-[55vh]">
				{isLoading ? (
					<div className="flex items-center justify-center py-10 text-zinc-500 text-sm">
						Loading...
					</div>
				) : filtered.length === 0 ? (
					<div className="flex flex-col items-center justify-center py-10 text-center">
						<Search size={24} className="text-zinc-600 mb-2" />
						<p className="text-sm text-zinc-400 font-medium">
							No results found
						</p>
						<p className="text-xs text-zinc-600 mt-1">
							{query || clientFilter
								? "Try adjusting your search or filter"
								: "No existing entries to use as a template"}
						</p>
					</div>
				) : (
					filtered.map((r) => (
						<div
							key={r.id}
							className="group flex items-center gap-2 px-3 py-2.5 rounded-lg border border-transparent hover:border-zinc-700 hover:bg-zinc-800/60 transition-all"
						>
							{/* Main clickable area */}
							<button
								type="button"
								onClick={() => onSelect(r.id)}
								className="flex items-center gap-3 flex-1 min-w-0 text-left"
							>
								<div className="w-8 h-8 rounded-lg bg-zinc-800 border border-zinc-700 flex items-center justify-center flex-shrink-0 group-hover:border-zinc-600 transition-colors">
									<BookOpen
										size={14}
										className="text-zinc-400"
									/>
								</div>
								<div className="flex-1 min-w-0">
									<div className="flex items-center gap-2 mb-0.5">
										<span className="text-sm font-medium text-white truncate group-hover:text-blue-400 transition-colors">
											{r.title}
										</span>
										{r.subtitle && (
											<span className="text-[10px] text-zinc-500 flex-shrink-0 font-mono">
												{
													r.subtitle
												}
											</span>
										)}
									</div>
									<div className="flex items-center gap-3 text-xs text-zinc-500">
										{r.clientName && (
											<span className="truncate max-w-[140px]">
												{
													r.clientName
												}
											</span>
										)}
										{r.detail && (
											<span className="truncate max-w-[180px] text-zinc-600">
												{
													r.detail
												}
											</span>
										)}
										{r.createdAt && (
											<span className="flex-shrink-0 tabular-nums">
												{new Date(
													r.createdAt
												).toLocaleDateString(
													"en-US",
													{
														month: "short",
														day: "numeric",
														year: "numeric",
													}
												)}
											</span>
										)}
									</div>
								</div>
								<div className="flex items-center gap-2 flex-shrink-0">
									{r.value && (
										<span className="text-sm font-semibold text-white tabular-nums font-mono">
											{r.value}
										</span>
									)}
									{r.badge && (
										<span
											className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border ${
												r.badgeColor ||
												"bg-zinc-700/50 text-zinc-400 border-zinc-600"
											}`}
										>
											{r.badge}
										</span>
									)}
									<ChevronRight
										size={14}
										className="text-zinc-600 group-hover:text-zinc-400 transition-colors"
									/>
								</div>
							</button>

							{r.isDeletable && onDelete && (
								<DeleteButton
									id={r.id}
									onDelete={onDelete}
									isDeleting={
										isDeletingId ===
										r.id
									}
								/>
							)}
						</div>
					))
				)}
			</div>
		</div>
	);
}
