import AdaptableTable from "../../components/AdaptableTable";
import { useAllQuotesQuery, useCreateQuoteMutation } from "../../hooks/useQuotes";
import { useClientByIdQuery } from "../../hooks/useClients";
import { useRequestByIdQuery } from "../../hooks/useRequests";
import { QuoteStatusValues, QuoteStatusLabels, type Quote } from "../../types/quotes";
import { useState, useMemo, useEffect } from "react";
import { Search, Plus, X, MoreVertical } from "lucide-react";
import { useNavigate, useLocation } from "react-router-dom";
import CreateQuote from "../../components/quotes/CreateQuote";
import { formatDate, formatCurrency } from "../../util/util";

export default function QuotesPage() {
	const navigate = useNavigate();
	const location = useLocation();
	const { data: quotes, isLoading: isFetchLoading, error: fetchError } = useAllQuotesQuery();
	const { mutateAsync: createQuote } = useCreateQuoteMutation();
	const [isModalOpen, setIsModalOpen] = useState(false);
	const [searchInput, setSearchInput] = useState("");

	const queryParams = new URLSearchParams(location.search);
	const clientFilter = queryParams.get("client");
	const requestFilter = queryParams.get("request");
	const statusFilter = queryParams.get("status");
	const searchFilter = queryParams.get("search");

	const { data: filterClient } = useClientByIdQuery(clientFilter);
	const { data: filterRequest } = useRequestByIdQuery(requestFilter);

	useEffect(() => {
		setSearchInput(searchFilter || "");
	}, [searchFilter]);

	const display = useMemo(() => {
		if (!quotes) return [];

		const activeSearch = searchInput || searchFilter;

		let filtered: Quote[] = quotes;

		if (clientFilter) {
			filtered = quotes.filter((q) => q.client_id === clientFilter);
		}

		if (requestFilter) {
			filtered = filtered.filter((q) => q.request_id === requestFilter);
		}

		if (statusFilter) {
			filtered = filtered.filter((q) => q.status === statusFilter);
		}

		if (activeSearch) {
			filtered = filtered.filter((q) => {
				const searchLower = activeSearch.toLowerCase();
				const clientName = q.client?.name?.toLowerCase() || "";
				const title = q.title?.toLowerCase() || "";
				const quoteNumber = q.quote_number?.toLowerCase() || "";
				const status = q.status?.toLowerCase() || "";
				const address = q.address?.toLowerCase() || "";
				const priority = q.priority?.toLowerCase() || "";

				return (
					title.includes(searchLower) ||
					clientName.includes(searchLower) ||
					quoteNumber.includes(searchLower) ||
					status.includes(searchLower) ||
					address.includes(searchLower) ||
					priority.includes(searchLower)
				);
			});
		}

		return filtered
			.map((q) => {
				return {
					id: q.id,
					client: q.client?.name || "Unknown Client",
					quoteNumber: `${q.quote_number}\n${q.title}`,
					property: q.address || "No address",
					created: formatDate(q.created_at),
					status: QuoteStatusLabels[q.status] || q.status,
					total: formatCurrency(Number(q.total)),
					_rawStatus: q.status,
					_rawTotal: Number(q.total),
					_createdDate: new Date(q.created_at),
					_rawQuoteNumber: q.quote_number, // For sorting if needed
				};
			})
			.sort((a, b) => {
				const statusDiff =
					QuoteStatusValues.indexOf(a._rawStatus as any) -
					QuoteStatusValues.indexOf(b._rawStatus as any);
				if (statusDiff !== 0) return statusDiff;

				return b._createdDate.getTime() - a._createdDate.getTime();
			})
			.map(
				({
					_rawStatus,
					_rawTotal,
					_createdDate,
					_rawQuoteNumber,
					...rest
				}) => rest
			);
	}, [quotes, searchInput, searchFilter, clientFilter, requestFilter, statusFilter]);

	const handleSearchSubmit = (e: React.FormEvent) => {
		e.preventDefault();

		const newParams = new URLSearchParams(location.search);

		if (searchInput.trim()) {
			newParams.set("search", searchInput.trim());
		} else {
			newParams.delete("search");
		}

		navigate(`/dispatch/quotes?${newParams.toString()}`);
	};

	const removeFilter = (filterType: "client" | "request" | "status" | "search") => {
		const newParams = new URLSearchParams(location.search);
		newParams.delete(filterType);

		if (filterType === "search") {
			setSearchInput("");
		}

		navigate(
			`/dispatch/quotes${newParams.toString() ? `?${newParams.toString()}` : ""}`
		);
	};

	const clearAllFilters = () => {
		setSearchInput("");
		navigate("/dispatch/quotes");
	};

	const hasFilters = clientFilter || requestFilter || statusFilter || searchFilter;

	return (
		<div className="text-white">
			<div className="flex flex-wrap items-center justify-between gap-4 mb-2">
				<h2 className="text-2xl font-semibold">Quotes</h2>

				<div className="flex gap-2 text-nowrap">
					<form
						onSubmit={handleSearchSubmit}
						className="relative w-full"
					>
						<Search
							size={18}
							className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"
						/>
						<input
							type="text"
							placeholder="Search quotes..."
							value={searchInput}
							onChange={(e) =>
								setSearchInput(e.target.value)
							}
							className="w-full pl-11 pr-3 py-2 rounded-md bg-zinc-800 border border-zinc-700 text-sm 
							text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-2 
							focus:ring-blue-500"
						/>
					</form>

					<button
						className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-md text-sm font-medium transition-colors"
						onClick={() => setIsModalOpen(true)}
					>
						<Plus size={16} className="text-white" />
						New Quote
					</button>
					<button className="flex items-center justify-center p-2 hover:bg-zinc-800 rounded-md transition-colors border border-zinc-700 hover:border-zinc-600">
						<MoreVertical size={20} className="text-white" />
					</button>
				</div>
			</div>

			{/* Single Filter Bar with Multiple Filters */}
			{hasFilters && (
				<div className="mb-2 p-3 bg-zinc-800 rounded-lg border border-zinc-700">
					<div className="flex items-center justify-between">
						<div className="flex items-center gap-2 flex-wrap">
							<span className="text-sm text-zinc-400">
								Active filters:
							</span>

							{/* Client Filter Chip */}
							{clientFilter && filterClient && (
								<div className="flex items-center gap-2 px-3 py-1.5 bg-blue-600/20 border border-blue-500/30 rounded-md">
									<span className="text-sm text-blue-300">
										Client:{" "}
										<span className="font-medium text-white">
											{
												filterClient.name
											}
										</span>
									</span>
									<button
										onClick={() =>
											removeFilter(
												"client"
											)
										}
										className="text-blue-300 hover:text-white transition-colors"
										aria-label="Remove client filter"
									>
										<X size={14} />
									</button>
								</div>
							)}

							{/* Request Filter Chip */}
							{requestFilter && filterRequest && (
								<div className="flex items-center gap-2 px-3 py-1.5 bg-green-600/20 border border-green-500/30 rounded-md">
									<span className="text-sm text-green-300">
										Request:{" "}
										<span className="font-medium text-white">
											{
												filterRequest.title
											}
										</span>
									</span>
									<button
										onClick={() =>
											removeFilter(
												"request"
											)
										}
										className="text-green-300 hover:text-white transition-colors"
										aria-label="Remove request filter"
									>
										<X size={14} />
									</button>
								</div>
							)}

							{/* Status Filter Chip */}
							{statusFilter && (
								<div className="flex items-center gap-2 px-3 py-1.5 bg-amber-600/20 border border-amber-500/30 rounded-md">
									<span className="text-sm text-amber-300">
										Status:{" "}
										<span className="font-medium text-white">
											{QuoteStatusLabels[
												statusFilter as keyof typeof QuoteStatusLabels
											] ||
												statusFilter}
										</span>
									</span>
									<button
										onClick={() =>
											removeFilter(
												"status"
											)
										}
										className="text-amber-300 hover:text-white transition-colors"
										aria-label="Remove status filter"
									>
										<X size={14} />
									</button>
								</div>
							)}

							{/* Search Filter Chip */}
							{searchFilter && (
								<div className="flex items-center gap-2 px-3 py-1.5 bg-purple-600/20 border border-purple-500/30 rounded-md">
									<span className="text-sm text-purple-300">
										Search:{" "}
										<span className="font-medium text-white">
											"
											{
												searchFilter
											}
											"
										</span>
									</span>
									<button
										onClick={() =>
											removeFilter(
												"search"
											)
										}
										className="text-purple-300 hover:text-white transition-colors"
										aria-label="Remove search filter"
									>
										<X size={14} />
									</button>
								</div>
							)}

							{/* Results Count */}
							<span className="text-sm text-zinc-500">
								• {display.length}{" "}
								{display.length === 1
									? "result"
									: "results"}
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

			<div className="shadow-sm border border-zinc-800 p-3 bg-zinc-900 rounded-lg overflow-hidden text-left">
				<style>{`
					table td {
						white-space: pre-line;
					}
				`}</style>
				<AdaptableTable
					data={display}
					loadListener={isFetchLoading}
					errListener={fetchError}
					onRowClick={(row) => navigate(`/dispatch/quotes/${row.id}`)}
				/>
			</div>

			<CreateQuote
				isModalOpen={isModalOpen}
				setIsModalOpen={setIsModalOpen}
				createQuote={async (input) => {
					const newQuote = await createQuote(input);

					if (!newQuote?.id)
						throw new Error(
							"Quote creation failed: no ID returned"
						);

					return newQuote.id;
				}}
			/>
		</div>
	);
}
