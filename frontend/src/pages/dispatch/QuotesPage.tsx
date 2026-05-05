import AdaptableTable from "../../components/AdaptableTable";
import { useAllQuotesQuery, useCreateQuoteMutation } from "../../hooks/useQuotes";
import { useClientByIdQuery } from "../../hooks/useClients";
import { useRequestByIdQuery } from "../../hooks/useRequests";
import { QuoteStatusValues, QuoteStatusLabels, type Quote, type QuoteStatus } from "../../types/quotes";
import { useState, useMemo } from "react";
import { Plus } from "lucide-react";
import { useNavigate, useLocation } from "react-router-dom";
import CreateQuote from "../../components/quotes/CreateQuote";
import { formatDate, formatCurrency } from "../../util/util";
import SearchBar from "../../components/ui/SearchBar";
import FilterChips, { type FilterChip } from "../../components/ui/FilterChips";
import PageControls from "../../components/ui/PageControls";
import StatusFilter from "../../components/ui/StatusFilter";
import DateRangeFilter from "../../components/ui/DateRangeFilter";
import { parseDateRangeFromParams, matchesDateRange } from "../../util/dateRangeUtils";
import PageHeader from "../../components/ui/PageHeader";

const quoteStatusOptions = QuoteStatusValues.map((s) => ({
	value: s,
	label: QuoteStatusLabels[s as keyof typeof QuoteStatusLabels] ?? s,
}));

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
	const dateParamKey = queryParams.get("date");
	const dateParamFrom = queryParams.get("dateFrom");
	const dateParamTo = queryParams.get("dateTo");

	const { data: filterClient } = useClientByIdQuery(clientFilter);
	const { data: filterRequest } = useRequestByIdQuery(requestFilter);

	const display = useMemo(() => {
		const _dp = new URLSearchParams();
		if (dateParamKey) _dp.set("date", dateParamKey);
		if (dateParamFrom) _dp.set("dateFrom", dateParamFrom);
		if (dateParamTo) _dp.set("dateTo", dateParamTo);
		const dateRange = parseDateRangeFromParams(_dp, "date");

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

		if (dateRange.option !== "all") {
			filtered = filtered.filter((q) =>
				matchesDateRange(q.created_at ? new Date(q.created_at) : null, dateRange)
			);
		}

		return filtered
			.slice()
			.sort((a, b) => {
				const statusDiff =
					QuoteStatusValues.indexOf(a.status as QuoteStatus) -
					QuoteStatusValues.indexOf(b.status as QuoteStatus);
				if (statusDiff !== 0) return statusDiff;

				return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
			})
			.map((q) => ({
				id: q.id,
				client: q.client?.name || "Unknown Client",
				quoteNumber: `${q.quote_number}\n${q.title}`,
				property: q.address || "No address",
				created: formatDate(q.created_at),
				status: QuoteStatusLabels[q.status] || q.status,
				total: formatCurrency(Number(q.total)),
			}));
	}, [quotes, searchInput, searchFilter, clientFilter, requestFilter, statusFilter, dateParamKey, dateParamFrom, dateParamTo]);

	const removeFilter = (filterType: "client" | "request" | "search") => {
		const newParams = new URLSearchParams(location.search);
		newParams.delete(filterType);
		if (filterType === "search") {
			setSearchInput("");
		}
		navigate(`/dispatch/quotes${newParams.toString() ? `?${newParams.toString()}` : ""}`);
	};

	const clearAllFilters = () => {
		setSearchInput("");
		const next = new URLSearchParams(location.search);
		next.delete("search");
		next.delete("client");
		next.delete("request");
		next.delete("date");
		next.delete("dateFrom");
		next.delete("dateTo");
		navigate(`/dispatch/quotes${next.toString() ? `?${next.toString()}` : ""}`);
	};

	return (
		<div className="text-white">
			<PageHeader title="Quotes">
				<button
					className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-md text-sm font-medium transition-colors"
					onClick={() => setIsModalOpen(true)}
				>
					<Plus size={16} className="text-white" />
					New Quote
				</button>
			</PageHeader>

			<PageControls
				className="mb-3"
				left={
					<SearchBar
						paramKey="search"
						placeholder="Search quotes..."
						onValueChange={setSearchInput}
					/>
				}
				middle={
					<div className="flex items-center gap-2">
						<StatusFilter paramKey="status" placeholder="Status" options={quoteStatusOptions} />
						<DateRangeFilter paramKey="date" />
					</div>
				}
				right={null}
			/>

			<FilterChips
				filters={[
					clientFilter && filterClient
						? { label: `Client: ${filterClient.name}`, color: "blue" as const, onRemove: () => removeFilter("client") }
						: null,
					requestFilter && filterRequest
						? { label: `Request: ${filterRequest.title}`, color: "orange" as const, onRemove: () => removeFilter("request") }
						: null,
					searchFilter
						? { label: `Search: "${searchFilter}"`, color: "purple" as const, onRemove: () => removeFilter("search") }
						: null,
				]}
				resultCount={display.length}
				onClearAll={clearAllFilters}
			/>

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
