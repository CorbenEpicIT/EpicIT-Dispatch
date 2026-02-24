import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
	Users,
	Clock,
	MapPin,
	CheckCircle2,
	AlertCircle,
	Calendar,
	TrendingUp,
	Activity,
	ChevronRight,
	RefreshCw,
} from "lucide-react";
import Card from "../../components/ui/Card";
import SmartCalendar from "../../components/ui/SmartCalendar";
import { useAllJobsQuery } from "../../hooks/useJobs";
import { useAllTechniciansQuery } from "../../hooks/useTechnicians";
import type { TechnicianWithVisits } from "../../types/technicians";
import type { JobVisit } from "../../types/jobs";

export default function DashboardPage() {
	const navigate = useNavigate();
	const { data: jobs = [], error: jobsError } = useAllJobsQuery();
	const {
		data: allTechnicians = [],
		error: techsError,
		refetch: refetchTechs,
	} = useAllTechniciansQuery();
	const [refreshing, setRefreshing] = useState(false);

	// Filter technicians who are on the clock (Available or Busy)
	const onlineTechnicians = allTechnicians.filter(
		(tech) => tech.status === "Available" || tech.status === "Busy"
	);

	const availableCount = allTechnicians.filter((t) => t.status === "Available").length;
	const busyCount = allTechnicians.filter((t) => t.status === "Busy").length;
	const totalOnline = availableCount + busyCount;

	const techniciansWithActiveVisits: TechnicianWithVisits[] = onlineTechnicians.map(
		(tech) => {
			const activeVisits = jobs
				.flatMap((job) => job.visits || [])
				.filter(
					(visit) =>
						visit.status === "InProgress" &&
						visit.visit_techs?.some(
							(vt) => vt.tech_id === tech.id
						)
				) as JobVisit[];

			const scheduledVisits = jobs
				.flatMap((job) => job.visits || [])
				.filter(
					(visit) =>
						visit.status === "Scheduled" &&
						visit.visit_techs?.some(
							(vt) => vt.tech_id === tech.id
						)
				) as JobVisit[];

			return {
				...tech,
				activeVisits,
				scheduledVisits,
				totalVisitsToday: activeVisits.length + scheduledVisits.length,
			};
		}
	);

	const handleRefresh = async () => {
		setRefreshing(true);
		await refetchTechs();
		setTimeout(() => setRefreshing(false), 500);
	};

	const getStatusColor = (status: string) => {
		switch (status) {
			case "Available":
				return "bg-green-500";
			case "Busy":
				return "bg-yellow-500";
			case "Break":
				return "bg-blue-500";
			case "Offline":
				return "bg-zinc-500";
			default:
				return "bg-zinc-500";
		}
	};

	// const getTimeOnClock = (lastLogin: Date | string) => {
	// 	const now = new Date();
	// 	const loginTime = new Date(lastLogin);
	// 	const diffMs = now.getTime() - loginTime.getTime();
	// 	const diffHours = Math.floor(diffMs / 3600000);
	// 	const diffMins = Math.floor((diffMs % 3600000) / 60000);

	// 	if (diffHours > 0) return `${diffHours}h ${diffMins}m`;
	// 	return `${diffMins}m`;
	// };

	const getCurrentVisit = (tech: TechnicianWithVisits) => {
		if (tech.activeVisits.length === 0) return null;
		return tech.activeVisits[0];
	};

	return (
		<div className="min-h-screen text-white p-6">
			<div className="grid gap-6 lg:grid-cols-3">
				{/* Calendar */}
				<Card className="lg:col-span-3">
					{jobsError && (
						<p className="text-red-400">
							Failed to load calendar.
						</p>
					)}
					<SmartCalendar
						jobs={jobs}
						view="week"
						toolbar={{
							left: "title",
							center: "",
							right: "today prev,next",
						}}
					/>
				</Card>

				{/* Stats Cards Row */}
				<div className="lg:col-span-3 grid gap-4 md:grid-cols-4">
					{/* Total Online */}
					<div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 hover:border-zinc-700 transition-colors">
						<div className="flex items-center justify-between mb-2">
							<div className="flex items-center gap-2">
								<Users
									size={18}
									className="text-blue-400"
								/>
								<span className="text-sm text-zinc-400">
									Online Now
								</span>
							</div>
						</div>
						<div className="text-3xl font-bold text-white">
							{totalOnline}
						</div>
						<div className="text-xs text-zinc-500 mt-1">
							{availableCount} available • {busyCount}{" "}
							busy
						</div>
					</div>

					{/* Active Jobs */}
					<div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 hover:border-zinc-700 transition-colors">
						<div className="flex items-center justify-between mb-2">
							<div className="flex items-center gap-2">
								<Activity
									size={18}
									className="text-yellow-400"
								/>
								<span className="text-sm text-zinc-400">
									In Progress
								</span>
							</div>
						</div>
						<div className="text-3xl font-bold text-white">
							{
								jobs
									.flatMap(
										(j) =>
											j.visits ||
											[]
									)
									.filter(
										(v) =>
											v.status ===
											"InProgress"
									).length
							}
						</div>
						<div className="text-xs text-zinc-500 mt-1">
							Active visits
						</div>
					</div>

					{/* Scheduled Today */}
					<div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 hover:border-zinc-700 transition-colors">
						<div className="flex items-center justify-between mb-2">
							<div className="flex items-center gap-2">
								<Calendar
									size={18}
									className="text-blue-400"
								/>
								<span className="text-sm text-zinc-400">
									Scheduled
								</span>
							</div>
						</div>
						<div className="text-3xl font-bold text-white">
							{
								jobs
									.flatMap(
										(j) =>
											j.visits ||
											[]
									)
									.filter(
										(v) =>
											v.status ===
											"Scheduled"
									).length
							}
						</div>
						<div className="text-xs text-zinc-500 mt-1">
							Today's visits
						</div>
					</div>

					{/* Completion Rate */}
					<div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 hover:border-zinc-700 transition-colors">
						<div className="flex items-center justify-between mb-2">
							<div className="flex items-center gap-2">
								<TrendingUp
									size={18}
									className="text-green-400"
								/>
								<span className="text-sm text-zinc-400">
									Completed
								</span>
							</div>
						</div>
						<div className="text-3xl font-bold text-white">
							{
								jobs
									.flatMap(
										(j) =>
											j.visits ||
											[]
									)
									.filter(
										(v) =>
											v.status ===
											"Completed"
									).length
							}
						</div>
						<div className="text-xs text-zinc-500 mt-1">
							This week
						</div>
					</div>
				</div>

				{/* Technicians Online - Main Section */}
				<Card className="lg:col-span-2">
					<div className="flex items-center justify-between mb-4">
						<div className="flex items-center gap-3">
							<div className="p-2 bg-blue-600/20 rounded-lg">
								<Users
									size={20}
									className="text-blue-400"
								/>
							</div>
							<div>
								<h3 className="text-lg font-semibold text-white">
									Active Technicians
								</h3>
								<p className="text-xs text-zinc-400">
									{totalOnline} active •
									Real-time status
								</p>
							</div>
						</div>
						<div className="flex items-center gap-2">
							<button
								onClick={handleRefresh}
								className={`p-2 bg-zinc-800 hover:bg-zinc-700 rounded-lg transition-colors ${refreshing ? "animate-spin" : ""}`}
								title="Refresh status"
							>
								<RefreshCw
									size={16}
									className="text-zinc-400"
								/>
							</button>
							<button
								onClick={() =>
									navigate(
										"/dispatch/technicians"
									)
								}
								className="flex items-center gap-1 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded-lg transition-colors"
							>
								View All
								<ChevronRight size={16} />
							</button>
						</div>
					</div>

					{techsError && (
						<div className="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/20 rounded-lg mb-4">
							<AlertCircle
								size={16}
								className="text-red-400"
							/>
							<p className="text-sm text-red-400">
								Failed to load technicians
							</p>
						</div>
					)}

					{!techsError && totalOnline === 0 && (
						<div className="text-center py-12">
							<div className="inline-flex items-center justify-center w-16 h-16 bg-zinc-800 rounded-full mb-3">
								<Clock
									size={24}
									className="text-zinc-500"
								/>
							</div>
							<p className="text-zinc-400 mb-1">
								No technicians currently online
							</p>
							<p className="text-xs text-zinc-500">
								Check back when the team clocks in
							</p>
						</div>
					)}

					{!techsError && totalOnline > 0 && (
						<div className="flex flex-wrap gap-3 max-h-[500px] overflow-y-auto pr-2">
							{techniciansWithActiveVisits.map((tech) => {
								const currentVisit =
									getCurrentVisit(tech);
								const isOnJob =
									tech.activeVisits.length >
									0;

								return (
									<div
										key={tech.id}
										className="group relative bg-zinc-800/50 border border-zinc-700 rounded-xl hover:border-blue-500/50 hover:bg-zinc-800 transition-all cursor-pointer overflow-hidden flex-shrink-0"
										style={{
											width: "180px",
											height: "260px",
										}}
										onClick={() =>
											navigate(
												`/dispatch/technicians/${tech.id}`
											)
										}
									>
										{/* Card Content*/}
										<div className="p-3 h-full flex flex-col">
											{/* Header: Avatar & Status*/}
											<div className="flex items-start justify-between mb-2">
												<div className="relative">
													<div className="w-11 h-11 rounded-lg bg-gradient-to-br from-blue-500 via-purple-500 to-pink-500 flex items-center justify-center text-white font-bold text-base shadow-md">
														{tech.name
															.charAt(
																0
															)
															.toUpperCase()}
													</div>
													<div
														className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 ${getStatusColor(tech.status)} rounded-full border-2 border-zinc-800 shadow-sm`}
													/>
												</div>

												<span
													className={`px-1.5 py-0.5 rounded text-[10px] font-semibold tracking-wide ${
														tech.status ===
														"Available"
															? "bg-green-500/20 text-green-400 border border-green-500/30"
															: "bg-yellow-500/20 text-yellow-400 border border-yellow-500/30"
													}`}
												>
													{
														tech.status
													}
												</span>
											</div>

											{/* Name & Title*/}
											<div className="mb-2">
												<h4 className="font-semibold text-white group-hover:text-blue-400 transition-colors truncate text-[13px] leading-tight mb-0.5">
													{
														tech.name
													}
												</h4>
												<p className="text-[10px] text-zinc-500 truncate leading-tight">
													{
														tech.title
													}
												</p>
											</div>

											{/* Status Box*/}
											<div className="mb-2 h-14 flex items-center">
												{isOnJob &&
													currentVisit && (
														<div className="w-full p-2 bg-yellow-500/10 border border-yellow-500/30 rounded-lg shadow-sm">
															<div className="flex items-center gap-1 mb-0.5">
																<Activity
																	size={
																		11
																	}
																	className="text-yellow-400 flex-shrink-0"
																/>
																<p className="text-[10px] font-bold text-yellow-400 uppercase tracking-wide">
																	On
																	Job
																</p>
															</div>
															<p className="text-[11px] text-zinc-200 truncate font-medium">
																{currentVisit
																	.job
																	?.name ||
																	"Unknown Job"}
															</p>
														</div>
													)}

												{!isOnJob &&
													tech
														.scheduledVisits
														.length >
														0 && (
														<div className="w-full p-2 bg-blue-500/10 border border-blue-500/30 rounded-lg shadow-sm">
															<div className="flex items-center gap-1 mb-0.5">
																<Calendar
																	size={
																		11
																	}
																	className="text-blue-400 flex-shrink-0"
																/>
																<p className="text-[10px] font-bold text-blue-400 uppercase tracking-wide">
																	Next
																	Up
																</p>
															</div>
															<p className="text-[11px] text-zinc-200 font-medium">
																{new Date(
																	tech
																		.scheduledVisits[0]
																		.scheduled_start_at
																).toLocaleTimeString(
																	"en-US",
																	{
																		hour: "numeric",
																		minute: "2-digit",
																		hour12: true,
																	}
																)}
															</p>
														</div>
													)}

												{!isOnJob &&
													tech
														.scheduledVisits
														.length ===
														0 && (
														<div className="w-full p-2 bg-green-500/10 border border-green-500/30 rounded-lg shadow-sm">
															<div className="flex items-center gap-1">
																<CheckCircle2
																	size={
																		11
																	}
																	className="text-green-400 flex-shrink-0"
																/>
																<p className="text-[10px] font-bold text-green-400 uppercase tracking-wide">
																	Available
																</p>
															</div>
														</div>
													)}
											</div>

											{/* Divider & Visit Count*/}
											<div className="mb-2 pb-2 border-b border-zinc-700/50">
												<div className="flex items-center justify-between text-[10px]">
													<span className="flex items-center gap-1 text-zinc-400">
														<Calendar
															size={
																10
															}
															className="text-zinc-500"
														/>
														<span className="font-medium">
															{
																tech.totalVisitsToday
															}
														</span>
														<span className="text-zinc-500">
															today
														</span>
													</span>
												</div>
											</div>

											{/* Assign Button*/}
											<button
												onClick={(
													e
												) => {
													e.stopPropagation();
													navigate(
														`/dispatch/technicians/${tech.id}/assign`
													);
												}}
												className="w-full flex items-center justify-center gap-1.5 px-3 py-2 bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-600 text-white text-[11px] font-bold rounded-lg transition-all hover:shadow-lg hover:shadow-blue-500/30 active:scale-95"
											>
												<MapPin
													size={
														12
													}
													className="flex-shrink-0"
												/>
												<span className="tracking-wide">
													ASSIGN
												</span>
											</button>
										</div>

										{/* Hover Glow Effect */}
										<div className="absolute inset-0 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none bg-gradient-to-br from-blue-500/5 via-transparent to-purple-500/5" />
									</div>
								);
							})}
						</div>
					)}
				</Card>

				<Card title="Pending Actions">
					<div className="space-y-3">
						<div className="flex items-center justify-between p-3 bg-zinc-800/50 rounded-lg">
							<div>
								<p className="text-sm font-medium text-white">
									Requests
								</p>
							</div>
						</div>
						<div className="flex items-center justify-between p-3 bg-zinc-800/50 rounded-lg">
							<div>
								<p className="text-sm font-medium text-white">
									Quotes
								</p>
							</div>
						</div>

						<div className="flex items-center justify-between p-3 bg-zinc-800/50 rounded-lg">
							<div>
								<p className="text-sm font-medium text-white">
									Unscheduled Jobs
								</p>
								<p className="text-xs text-zinc-400">
									{
										jobs.filter(
											(j) =>
												j.status ===
												"Unscheduled"
										).length
									}{" "}
									need scheduling
								</p>
							</div>
							<button
								onClick={() =>
									navigate("/dispatch/jobs")
								}
								className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs rounded transition-colors"
							>
								View
							</button>
						</div>
					</div>
				</Card>
			</div>
		</div>
	);
}
