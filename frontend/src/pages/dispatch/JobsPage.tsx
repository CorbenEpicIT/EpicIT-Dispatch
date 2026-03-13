import AdaptableTable from "../../components/AdaptableTable";
import { useAllJobsQuery, useCreateJobMutation } from "../../hooks/useJobs";
import { useAllRecurringPlansQuery } from "../../hooks/useRecurringPlans";
import { useClientByIdQuery } from "../../hooks/useClients";
import { JobStatusValues } from "../../types/jobs";
import { RecurringPlanStatusValues } from "../../types/recurringPlans";
import { useState, useMemo, useEffect, useRef } from "react";
import { Search, Plus, MoreVertical, X, Repeat, Briefcase, Download, Upload } from "lucide-react";
import { useNavigate, useLocation } from "react-router-dom";
import CreateJob from "../../components/jobs/CreateJob";
import CreateRecurringPlan from "../../components/recurringPlans/CreateRecurringPlan";
import { addSpacesToCamelCase, formatDate, formatCurrency } from "../../util/util";

type ViewMode = "jobs" | "templates";

export default function JobsPage() {
	const navigate = useNavigate();
	const location = useLocation();
	const { data: jobs, isLoading: jobsLoading, error: jobsError } = useAllJobsQuery();
	const {
		data: recurringPlans,
		isLoading: plansLoading,
		error: plansError,
	} = useAllRecurringPlansQuery();
	const { mutateAsync: createJob } = useCreateJobMutation();
	const [isCreateJobModalOpen, setIsCreateJobModalOpen] = useState(false);
	const [isCreatePlanModalOpen, setIsCreatePlanModalOpen] = useState(false);
	const [searchInput, setSearchInput] = useState("");
	const [viewMode, setViewMode] = useState<ViewMode>("jobs");
	const [showActionsMenu, setShowActionsMenu] = useState(false);
	const menuRef = useRef<HTMLDivElement>(null);

	const queryParams = new URLSearchParams(location.search);
	const clientFilter = queryParams.get("client");
	const statusFilter = queryParams.get("status");
	const searchFilter = queryParams.get("search");
	const viewParam = queryParams.get("view") as ViewMode | null;

	const { data: filterClient } = useClientByIdQuery(clientFilter);

	const isFetchLoading = jobsLoading || plansLoading;
	const fetchError = jobsError || plansError;

	// Close menu on outside click
	useEffect(() => {
		const handleOutsideClick = (event: MouseEvent) => {
			if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
				setShowActionsMenu(false);
			}
		};

		if (showActionsMenu) {
			document.addEventListener("mousedown", handleOutsideClick);
			return () => document.removeEventListener("mousedown", handleOutsideClick);
		}
	}, [showActionsMenu]);

	useEffect(() => {
		setSearchInput(searchFilter || "");
		setViewMode(viewParam || "jobs");
	}, [searchFilter, viewParam]);

	const display = useMemo(() => {
		const activeSearch = searchInput || searchFilter;

		if (viewMode === "templates") {
			// TEMPLATES VIEW - Show only recurring plan templates
			let templatesData =
				recurringPlans?.map((plan) => {
					const upcomingOccurrences = (plan.occurrences || [])
						.filter(
							(occ) =>
								new Date(occ.occurrence_start_at) >
									new Date() &&
								(occ.status === "planned" ||
									occ.status === "generated")
						)
						.sort(
							(a, b) =>
								new Date(
									a.occurrence_start_at
								).getTime() -
								new Date(
									b.occurrence_start_at
								).getTime()
						);

					let scheduleDisplay = "No occurrences";
					let scheduleDate: Date | null = null;

					if (upcomingOccurrences.length > 0) {
						const nextOccurrence = upcomingOccurrences[0];
						scheduleDisplay = `NEXT\n${formatDate(
							nextOccurrence.occurrence_start_at
						)}`;
						scheduleDate = new Date(
							nextOccurrence.occurrence_start_at
						);
					} else if (plan.status === "Completed") {
						scheduleDisplay = "COMPLETED";
					} else if (plan.status === "Cancelled") {
						scheduleDisplay = "CANCELLED";
					}

					const templateTotal =
						plan.line_items?.reduce(
							(sum, item) =>
								sum +
								item.quantity * item.unit_price,
							0
						) || 0;

					return {
						id: plan.id,
						client: plan.client?.name || "Unknown Client",
						title: plan.name,
						property: plan.address || "No address",
						schedule: scheduleDisplay,
						status: addSpacesToCamelCase(plan.status),
						templateTotal: formatCurrency(templateTotal),
						_rawStatus: plan.status,
						_scheduleDate: scheduleDate,
						_clientId: plan.client_id,
						_recurringPlanId: plan.id,
					};
				}) || [];

			if (clientFilter) {
				templatesData = templatesData.filter(
					(item) => item._clientId === clientFilter
				);
			}

			if (activeSearch) {
				templatesData = templatesData.filter((item) => {
					const searchLower = activeSearch.toLowerCase();
					const clientName = item.client?.toLowerCase() || "";
					const title = item.title?.toLowerCase() || "";
					const property = item.property?.toLowerCase() || "";
					const status = item.status?.toLowerCase() || "";

					return (
						title.includes(searchLower) ||
						clientName.includes(searchLower) ||
						property.includes(searchLower) ||
						status.includes(searchLower)
					);
				});
			}

			return templatesData
				.sort((a, b) => {
					// Sort by status
					const statusDiff =
						RecurringPlanStatusValues.indexOf(
							a._rawStatus as any
						) -
						RecurringPlanStatusValues.indexOf(
							b._rawStatus as any
						);
					if (statusDiff !== 0) return statusDiff;

					// Then by schedule date (nulls last)
					if (a._scheduleDate && b._scheduleDate) {
						return (
							a._scheduleDate.getTime() -
							b._scheduleDate.getTime()
						);
					}
					if (a._scheduleDate) return -1;
					if (b._scheduleDate) return 1;

					return 0;
				})
				.map(
					({
						_rawStatus,
						_scheduleDate,
						_clientId,
						_recurringPlanId,
						...rest
					}) => rest
				);
		} else {
			// JOBS VIEW - Show all job containers (one-time + recurring)
			let jobsData =
				jobs?.map((j) => {
					const allVisits = (j.visits || []).sort(
						(a, b) =>
							new Date(a.scheduled_start_at).getTime() -
							new Date(b.scheduled_start_at).getTime()
					);

					let scheduleDisplay = "No visits scheduled";
					let scheduleDate: Date | null = null;

					if (j.status === "Completed") {
						const completedVisits = allVisits
							.filter((v) => v.status === "Completed")
							.sort(
								(a, b) =>
									new Date(
										b.actual_end_at ||
											b.scheduled_end_at
									).getTime() -
									new Date(
										a.actual_end_at ||
											a.scheduled_end_at
									).getTime()
							);

						if (completedVisits.length > 0) {
							const lastVisit = completedVisits[0];
							const completedDate =
								lastVisit.actual_end_at ||
								lastVisit.scheduled_end_at;
							scheduleDisplay = `COMPLETED\n${formatDate(completedDate)}`;
							scheduleDate = new Date(completedDate);
						}
					} else {
						const scheduledVisits = allVisits.filter(
							(v) =>
								v.status === "Scheduled" ||
								v.status === "InProgress"
						);

						if (scheduledVisits.length > 0) {
							const nextVisit = scheduledVisits[0];
							scheduleDisplay = formatDate(
								nextVisit.scheduled_start_at
							);
							scheduleDate = new Date(
								nextVisit.scheduled_start_at
							);
						}
					}

					return {
						id: j.id,
						isRecurring: !!j.recurring_plan_id,
						client: j.client?.name || "Unknown Client",
						jobNumber: `${j.job_number}\n${j.name}`,
						property: j.address || "No address",
						schedule: scheduleDisplay,
						status: addSpacesToCamelCase(j.status),
						total: formatCurrency(
							Number(
								j.estimated_total ||
									j.actual_total ||
									0
							)
						),
						_rawStatus: j.status,
						_rawTotal: Number(
							j.estimated_total || j.actual_total || 0
						),
						_scheduleDate: scheduleDate,
						_rawJobNumber: j.job_number,
						_clientId: j.client_id,
						_jobId: j.id,
					};
				}) || [];

			if (clientFilter) {
				jobsData = jobsData.filter(
					(item) => item._clientId === clientFilter
				);
			}

			if (statusFilter) {
				jobsData = jobsData.filter(
					(item) => item._rawStatus === statusFilter
				);
			}

			if (activeSearch) {
				jobsData = jobsData.filter((item) => {
					const searchLower = activeSearch.toLowerCase();
					const clientName = item.client?.toLowerCase() || "";
					const jobInfo = item.jobNumber?.toLowerCase() || "";
					const status = item.status?.toLowerCase() || "";
					const address = item.property?.toLowerCase() || "";

					return (
						jobInfo.includes(searchLower) ||
						clientName.includes(searchLower) ||
						status.includes(searchLower) ||
						address.includes(searchLower)
					);
				});
			}

			return jobsData
				.sort((a, b) => {
					// Sort by status
					const statusDiff =
						JobStatusValues.indexOf(a._rawStatus as any) -
						JobStatusValues.indexOf(b._rawStatus as any);
					if (statusDiff !== 0) return statusDiff;

					// Then by schedule date (nulls last)
					if (a._scheduleDate && b._scheduleDate) {
						return (
							a._scheduleDate.getTime() -
							b._scheduleDate.getTime()
						);
					}
					if (a._scheduleDate) return -1;
					if (b._scheduleDate) return 1;

					return 0;
				})
				.map(
					({
						_rawStatus,
						_rawTotal,
						_scheduleDate,
						_rawJobNumber,
						_clientId,
						_jobId,
						isRecurring,
						...rest
					}) => ({
						...rest,
						jobNumber: isRecurring
							? `🔄 ${rest.jobNumber}`
							: rest.jobNumber,
					})
				);
		}
	}, [jobs, recurringPlans, searchInput, searchFilter, clientFilter, statusFilter, viewMode]);

	const handleSearchSubmit = (e: React.FormEvent) => {
		e.preventDefault();

		const newParams = new URLSearchParams(location.search);

		if (searchInput.trim()) {
			newParams.set("search", searchInput.trim());
		} else {
			newParams.delete("search");
		}

		navigate(`/dispatch/jobs?${newParams.toString()}`);
	};

	const handleViewModeChange = (mode: ViewMode) => {
		setViewMode(mode);
		const newParams = new URLSearchParams(location.search);

		if (mode !== "jobs") {
			newParams.set("view", mode);
		} else {
			newParams.delete("view");
		}

		navigate(`/dispatch/jobs?${newParams.toString()}`);
	};

	const removeFilter = (filterType: "client" | "status" | "search") => {
		const newParams = new URLSearchParams(location.search);
		newParams.delete(filterType);

		if (filterType === "search") {
			setSearchInput("");
		}

		navigate(`/dispatch/jobs${newParams.toString() ? `?${newParams.toString()}` : ""}`);
	};

	const clearAllFilters = () => {
		setSearchInput("");
		navigate("/dispatch/jobs");
	};

	const hasFilters = clientFilter || statusFilter || searchFilter;

	return (
		<div className="text-white">
			<div className="flex flex-wrap items-center justify-between gap-4 mb-2">
				<h2 className="text-2xl font-semibold">Jobs</h2>

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
							placeholder="Search jobs..."
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
						onClick={() => setIsCreateJobModalOpen(true)}
					>
						<Plus size={16} className="text-white" />
						New Job
					</button>

					<button
						className="flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 rounded-md text-sm font-medium transition-colors"
						onClick={() => setIsCreatePlanModalOpen(true)}
					>
						<Repeat size={16} className="text-white" />
						New Recurring Plan
					</button>

					{/* Actions Menu */}
					<div className="relative" ref={menuRef}>
						<button
							onClick={() =>
								setShowActionsMenu(!showActionsMenu)
							}
							className="flex items-center justify-center p-2 hover:bg-zinc-800 rounded-md transition-colors border border-zinc-700 hover:border-zinc-600"
						>
							<MoreVertical
								size={20}
								className="text-white"
							/>
						</button>

						{showActionsMenu && (
							<div className="absolute right-0 mt-2 w-56 bg-zinc-900 border border-zinc-800 rounded-lg shadow-xl z-50">
								<div className="py-1">
									<button
										onClick={() => {
											// TODO: Implement export functionality
											setShowActionsMenu(
												false
											);
										}}
										className="w-full px-4 py-2 text-left text-sm hover:bg-zinc-800 transition-colors flex items-center gap-2"
									>
										<Download
											size={16}
										/>
										Export Jobs
									</button>
									<button
										onClick={() => {
											// TODO: Implement import functionality
											setShowActionsMenu(
												false
											);
										}}
										className="w-full px-4 py-2 text-left text-sm hover:bg-zinc-800 transition-colors flex items-center gap-2"
									>
										<Upload size={16} />
										Import Jobs
									</button>
									<div className="border-t border-zinc-800 my-1"></div>
									<button
										onClick={() => {
											// TODO: Implement settings
											setShowActionsMenu(
												false
											);
										}}
										className="w-full px-4 py-2 text-left text-sm hover:bg-zinc-800 transition-colors flex items-center gap-2"
									>
										⚙️ Settings
									</button>
								</div>
							</div>
						)}
					</div>
				</div>
			</div>

			{/* View Mode Toggle */}
			<div className="mb-3 flex gap-2">
				<button
					onClick={() => handleViewModeChange("jobs")}
					className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
						viewMode === "jobs"
							? "bg-blue-600 text-white"
							: "bg-zinc-800 text-zinc-400 hover:bg-zinc-700"
					}`}
				>
					<Briefcase size={16} />
					Jobs ({jobs?.length || 0})
				</button>
				<button
					onClick={() => handleViewModeChange("templates")}
					className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
						viewMode === "templates"
							? "bg-blue-600 text-white"
							: "bg-zinc-800 text-zinc-400 hover:bg-zinc-700"
					}`}
				>
					<Repeat size={16} />
					Recurring Plans ({recurringPlans?.length || 0})
				</button>
			</div>

			{/* Filter Bar */}
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

							{/* Status Filter Chip */}
							{statusFilter && (
								<div className="flex items-center gap-2 px-3 py-1.5 bg-orange-600/20 border border-orange-500/30 rounded-md">
									<span className="text-sm text-orange-300">
										Status:{" "}
										<span className="font-medium text-white">
											{addSpacesToCamelCase(
												statusFilter
											)}
										</span>
									</span>
									<button
										onClick={() =>
											removeFilter(
												"status"
											)
										}
										className="text-orange-300 hover:text-white transition-colors"
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
					onRowClick={(row) => {
						if (viewMode === "templates") {
							navigate(
								`/dispatch/recurring-plans/${row.id}`
							);
						} else {
							navigate(`/dispatch/jobs/${row.id}`);
						}
					}}
				/>
			</div>

			<CreateJob
				isModalOpen={isCreateJobModalOpen}
				setIsModalOpen={setIsCreateJobModalOpen}
				createJob={async (input) => {
					const newJob = await createJob(input);

					if (!newJob?.id)
						throw new Error(
							"Job creation failed: no ID returned"
						);

					navigate(`/dispatch/jobs/${newJob.id}`);

					return newJob.id;
				}}
			/>

			<CreateRecurringPlan
				isModalOpen={isCreatePlanModalOpen}
				setIsModalOpen={setIsCreatePlanModalOpen}
			/>
		</div>
	);
}
