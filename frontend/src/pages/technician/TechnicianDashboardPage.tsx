import { useMemo } from "react";
import { AlertCircle } from "lucide-react";
import Card from "../../components/ui/Card";
import SmartCalendar from "../../components/ui/SmartCalendar";
import { useAllJobsQuery } from "../../hooks/useJobs";
import { useAuthStore } from "../../auth/authStore";

export default function TechnicianDashboardPage() {
	const { user } = useAuthStore();
	const { data: jobs = [], error: jobsError } = useAllJobsQuery();

	const myJobs = useMemo(() => {
		if (!user) return [];
		return jobs
			.map((job) => ({
				...job,
				visits: (job.visits ?? []).filter((v) =>
					v.visit_techs?.some((vt) => vt.tech?.email === user.name)
				),
			}))
			.filter((job) => job.visits.length > 0);
	}, [jobs, user?.name]);

	return (
		<div className="min-h-0 bg-zinc-950 text-zinc-100 w-full">
			<div className="w-full px-3 sm:px-5 lg:px-6">
				<div className="mb-5">
					<h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight">
						My Schedule
					</h1>
					<p className="text-sm text-zinc-400 mt-1">
						{new Date().toLocaleDateString("en-US", {
							weekday: "long",
							month: "long",
							day: "numeric",
						})}
					</p>
				</div>

				<Card className="mb-5 !p-0">
					<div className="p-3 sm:p-4">
						{jobsError ? (
							<div className="flex items-center justify-center h-full">
								<div className="flex items-center gap-2 p-4 bg-red-500/10 border border-red-500/20 rounded-lg">
									<AlertCircle size={16} className="text-red-400" />
									<p className="text-sm text-red-400">
										Failed to load calendar data
									</p>
								</div>
							</div>
						) : (
							<SmartCalendar
								jobs={myJobs}
								view="week"
								toolbar={{
									left: "title",
									center: "",
									right: "today prev,next",
								}}
							/>
						)}
					</div>
				</Card>
			</div>
		</div>
	);
}
