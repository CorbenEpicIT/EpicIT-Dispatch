import SmartCalendar from "../../components/ui/SmartCalendar";
import { useAllJobsQuery } from "../../hooks/useJobs";

export default function SchedulePage() {
	const { data: jobs = [], error } = useAllJobsQuery();

	return (
		<div className="h-full p-6 bg-zinc-950 text-white">
			<div className="rounded-lg bg-zinc-900 border border-zinc-800 shadow-md p-4">
				{error && (
					<p className="text-red-400 mb-2">Failed to load events.</p>
				)}

				<SmartCalendar
					jobs={jobs}
					view="month"
					toolbar={{
						left: "title",
						center: "",
						right: "today prev,next",
					}}
				/>
			</div>
		</div>
	);
}
