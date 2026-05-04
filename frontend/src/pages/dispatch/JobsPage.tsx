import AdaptableTable from "../../components/AdaptableTable";
import { useAllJobsQuery, useCreateJobMutation } from "../../hooks/useJobs";
import { useAllRecurringPlansQuery } from "../../hooks/useRecurringPlans";
import { useClientByIdQuery } from "../../hooks/useClients";
import { JobStatusValues, type JobStatus } from "../../types/jobs";
import { RecurringPlanStatusValues, type RecurringPlanStatus } from "../../types/recurringPlans";
import { useState, useMemo, useEffect, useRef } from "react";
import { Plus, MoreVertical, Repeat, Upload } from "lucide-react";
import { useNavigate, useLocation } from "react-router-dom";
import CreateJob from "../../components/jobs/CreateJob";
import CreateRecurringPlan from "../../components/recurringPlans/CreateRecurringPlan";
import { addSpacesToCamelCase, formatDate, formatCurrency } from "../../util/util";
import SearchBar from "../../components/ui/SearchBar";
import FilterChips, { type FilterChip } from "../../components/ui/FilterChips";
import PageControls from "../../components/ui/PageControls";
import StatusFilter from "../../components/ui/StatusFilter";
import ContextToggle, { type JobsView } from "../../components/ui/ContextToggle";
import PageHeader from "../../components/ui/PageHeader";

const jobStatusOptions = JobStatusValues.map((s) => ({
	value: s,
	label: addSpacesToCamelCase(s),
}));

const planStatusOptions = RecurringPlanStatusValues.map((s) => ({
	value: s,
	label: addSpacesToCamelCase(s),
}));

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
	const [viewMode, setViewMode] = useState<JobsView>("jobs");
	const [showActionsMenu, setShowActionsMenu] = useState(false);
	const menuRef = useRef<HTMLDivElement>(null);

	const queryParams = new URLSearchParams(location.search);
	const clientFilter = queryParams.get("client");
	const statusFilter = queryParams.get("status");
	const searchFilter = queryParams.get("search");
	const viewParam = queryParams.get("view") as JobsView | null;

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
		setViewMode(viewParam || "jobs");
	}, [viewParam]);

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

			if (statusFilter) {
				templatesData = templatesData.filter(
					(item) => item._rawStatus === statusFilter
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
							a._rawStatus as RecurringPlanStatus
						) -
						RecurringPlanStatusValues.indexOf(
							b._rawStatus as RecurringPlanStatus
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
					// eslint-disable-next-line @typescript-eslint/no-unused-vars
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
						JobStatusValues.indexOf(a._rawStatus as JobStatus) -
						JobStatusValues.indexOf(b._rawStatus as JobStatus);
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
					// eslint-disable-next-line @typescript-eslint/no-unused-vars
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

	const handleViewModeChange = (mode: JobsView) => {
		setViewMode(mode);
		const newParams = new URLSearchParams(location.search);
		if (mode !== "jobs") {
			newParams.set("view", mode);
		} else {
			newParams.delete("view");
		}
		newParams.delete("status");
		navigate(`/dispatch/jobs?${newParams.toString()}`);
	};

	const removeFilter = (filterType: "client" | "search") => {
		const newParams = new URLSearchParams(location.search);
		newParams.delete(filterType);
		if (filterType === "search") {
			setSearchInput("");
		}
		navigate(`/dispatch/jobs${newParams.toString() ? `?${newParams.toString()}` : ""}`);
	};

	const clearAllFilters = () => {
		setSearchInput("");
		const next = new URLSearchParams(location.search);
		next.delete("search");
		next.delete("client");
		navigate(`/dispatch/jobs${next.toString() ? `?${next.toString()}` : ""}`);
	};

	return (
		<div className="text-white">
			<PageHeader title="Jobs">
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
									onClick={() => {
										setShowActionsMenu(
											false
										);
									}}
									className="w-full px-4 py-2 text-left text-sm hover:bg-zinc-800/70 transition-colors flex items-center gap-2"
								>
									<Upload size={16} />
									Import Jobs
								</button>
							</div>
						</div>
					)}
				</div>
			</PageHeader>

			<PageControls
				className="mb-4"
				left={
					<>
						<ContextToggle
							value={viewMode}
							onChange={handleViewModeChange}
						/>
						<SearchBar
							paramKey="search"
							placeholder={
								viewMode === "jobs"
									? "Search jobs..."
									: "Search plans..."
							}
							onValueChange={setSearchInput}
						/>
					</>
				}
				middle={
					<StatusFilter
						paramKey="status"
						placeholder="Status"
						options={
							viewMode === "jobs"
								? jobStatusOptions
								: planStatusOptions
						}
					/>
				}
				right={null}
			/>

			{/* Filter Bar */}
			<FilterChips
				filters={[
					clientFilter && filterClient
						? {
								label: `Client: ${filterClient.name}`,
								color: "blue" as const,
								onRemove: () =>
									removeFilter("client"),
							}
						: null,
					searchFilter
						? {
								label: `Search: "${searchFilter}"`,
								color: "purple" as const,
								onRemove: () =>
									removeFilter("search"),
							}
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
