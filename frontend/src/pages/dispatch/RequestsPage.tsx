import AdaptableTable from "../../components/AdaptableTable";
import { useAllRequestsQuery, useCreateRequestMutation } from "../../hooks/useRequests";
import { useClientByIdQuery } from "../../hooks/useClients";
import { RequestStatusValues, RequestStatusLabels, type Request } from "../../types/requests";
import { PriorityLabels } from "../../types/common";
import { useState, useMemo } from "react";
import { Plus } from "lucide-react";
import { useNavigate, useLocation } from "react-router-dom";
import CreateRequest from "../../components/requests/CreateRequest";
import { formatDate } from "../../util/util";
import SearchBar from "../../components/ui/SearchBar";
import FilterChips, { type FilterChip } from "../../components/ui/FilterChips";
import PageControls from "../../components/ui/PageControls";
import StatusFilter from "../../components/ui/StatusFilter";
import PageHeader from "../../components/ui/PageHeader";

const requestStatusOptions = RequestStatusValues.map((s) => ({
	value: s,
	label: RequestStatusLabels[s as keyof typeof RequestStatusLabels] ?? s,
}));

export default function RequestsPage() {
	const navigate = useNavigate();
	const location = useLocation();
	const {
		data: requests,
		isLoading: isFetchLoading,
		error: fetchError,
	} = useAllRequestsQuery();
	const { mutateAsync: createRequest } = useCreateRequestMutation();
	const [isModalOpen, setIsModalOpen] = useState(false);
	const [searchInput, setSearchInput] = useState("");

	const queryParams = new URLSearchParams(location.search);
	const clientFilter = queryParams.get("client");
	const statusFilter = queryParams.get("status");
	const searchFilter = queryParams.get("search");

	const { data: filterClient } = useClientByIdQuery(clientFilter);

	const display = useMemo(() => {
		if (!requests) return [];

		const activeSearch = searchInput || searchFilter;

		let filtered: Request[] = requests;

		if (clientFilter) {
			filtered = requests.filter((r) => r.client_id === clientFilter);
		}

		if (statusFilter) {
			filtered = filtered.filter((r) => r.status === statusFilter);
		}

		if (activeSearch) {
			filtered = filtered.filter((r) => {
				const searchLower = activeSearch.toLowerCase();
				const clientName = r.client?.name?.toLowerCase() || "";
				const title = r.title?.toLowerCase() || "";
				const status = r.status?.toLowerCase() || "";
				const address = r.address?.toLowerCase() || "";
				const priority = r.priority?.toLowerCase() || "";

				return (
					title.includes(searchLower) ||
					clientName.includes(searchLower) ||
					status.includes(searchLower) ||
					address.includes(searchLower) ||
					priority.includes(searchLower)
				);
			});
		}

		return filtered
			.map((r) => {
				return {
					id: r.id,
					client: r.client?.name || "Unknown Client",
					title: r.title,
					property: r.address || "No address",
					priority: PriorityLabels[r.priority] || r.priority,
					created: formatDate(r.created_at),
					status: RequestStatusLabels[r.status] || r.status,
					_rawStatus: r.status, // Keep raw status for sorting
					_rawPriority: r.priority, // Keep raw priority for additional sorting
				};
			})
			.sort((a, b) => {
				// First sort by status
				const statusDiff =
					RequestStatusValues.indexOf(a._rawStatus as (typeof RequestStatusValues)[number]) -
					RequestStatusValues.indexOf(b._rawStatus as (typeof RequestStatusValues)[number]);
				if (statusDiff !== 0) return statusDiff;

				// Then by priority
				const priorityOrder = [
					"Emergency",
					"Urgent",
					"High",
					"Medium",
					"Low",
				];
				return (
					priorityOrder.indexOf(a._rawPriority) -
					priorityOrder.indexOf(b._rawPriority)
				);
			})
			.map((r) => ({ id: r.id, client: r.client, title: r.title, property: r.property, priority: r.priority, created: r.created, status: r.status }));
	}, [requests, searchInput, searchFilter, clientFilter, statusFilter]);

	const removeFilter = (filterType: "client" | "search") => {
		const newParams = new URLSearchParams(location.search);
		newParams.delete(filterType);

		if (filterType === "search") {
			setSearchInput("");
		}

		navigate(
			`/dispatch/requests${newParams.toString() ? `?${newParams.toString()}` : ""}`
		);
	};

	const clearAllFilters = () => {
		setSearchInput("");
		const next = new URLSearchParams(location.search);
		next.delete("search");
		next.delete("client");
		navigate(`/dispatch/requests${next.toString() ? `?${next.toString()}` : ""}`);
	};

	return (
		<div className="text-white">
			<PageHeader title="Requests">
				<button
					className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-md text-sm font-medium transition-colors"
					onClick={() => setIsModalOpen(true)}
				>
					<Plus size={16} className="text-white" />
					New Request
				</button>
			</PageHeader>

			<PageControls
				className="mb-3"
				left={
					<SearchBar
						paramKey="search"
						placeholder="Search requests..."
						onValueChange={setSearchInput}
					/>
				}
				middle={<StatusFilter paramKey="status" placeholder="Status" options={requestStatusOptions} />}
				right={null}
			/>

			<FilterChips
				filters={[
					clientFilter && filterClient
						? { label: `Client: ${filterClient.name}`, color: "blue" as const, onRemove: () => removeFilter("client") }
						: null,
					searchFilter
						? { label: `Search: "${searchFilter}"`, color: "purple" as const, onRemove: () => removeFilter("search") }
						: null,
				]}
				resultCount={display.length}
				onClearAll={clearAllFilters}
			/>

			<div className="shadow-sm border border-zinc-800 p-3 bg-zinc-900 rounded-lg overflow-hidden text-left">
				<AdaptableTable
					data={display}
					loadListener={isFetchLoading}
					errListener={fetchError}
					onRowClick={(row) =>
						navigate(`/dispatch/requests/${row.id}`)
					}
				/>
			</div>

			<CreateRequest
				isModalOpen={isModalOpen}
				setIsModalOpen={setIsModalOpen}
				createRequest={async (input) => {
					const newRequest = await createRequest(input);

					if (!newRequest?.id)
						throw new Error(
							"Request creation failed: no ID returned"
						);

					return newRequest.id;
				}}
			/>
		</div>
	);
}
