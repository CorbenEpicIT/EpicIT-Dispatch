import AdaptableTable from "../../components/AdaptableTable";
import { useAllRequestsQuery, useCreateRequestMutation } from "../../hooks/useRequests";
import { useClientByIdQuery } from "../../hooks/useClients";
import { RequestStatusValues, RequestStatusLabels, type Request } from "../../types/requests";
import { PriorityLabels } from "../../types/common";
import { useState, useMemo, useEffect } from "react";
import { Search, Plus, MoreVertical, X } from "lucide-react";
import { useNavigate, useLocation } from "react-router-dom";
import CreateRequest from "../../components/requests/CreateRequest";
import { formatDate } from "../../util/util";

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
	const searchFilter = queryParams.get("search");

	const { data: filterClient } = useClientByIdQuery(clientFilter);

	useEffect(() => {
		setSearchInput(searchFilter || "");
	}, [searchFilter]);

	const display = useMemo(() => {
		if (!requests) return [];

		const activeSearch = searchInput || searchFilter;

		let filtered: Request[] = requests;

		if (clientFilter) {
			filtered = requests.filter((r) => r.client_id === clientFilter);
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
					RequestStatusValues.indexOf(a._rawStatus as any) -
					RequestStatusValues.indexOf(b._rawStatus as any);
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
			.map(({ _rawStatus, _rawPriority, ...rest }) => rest);
	}, [requests, searchInput, searchFilter, clientFilter]);

	const handleSearchSubmit = (e: React.FormEvent) => {
		e.preventDefault();

		const newParams = new URLSearchParams(location.search);

		if (searchInput.trim()) {
			newParams.set("search", searchInput.trim());
		} else {
			newParams.delete("search");
		}

		navigate(`/dispatch/requests?${newParams.toString()}`);
	};

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
		navigate("/dispatch/requests");
	};

	const hasFilters = clientFilter || searchFilter;

	return (
		<div className="text-white">
			<div className="flex flex-wrap items-center justify-between gap-4 mb-2">
				<h2 className="text-2xl font-semibold">Requests</h2>

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
							placeholder="Search requests..."
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
						New Request
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
