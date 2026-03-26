import AdaptableTable from "../../components/AdaptableTable";
import { useAllJobVisitsQuery, useAcceptJobVisitMutation } from "../../hooks/useJobs";
import { VisitStatusValues, type VisitStatus } from "../../types/jobs";
import { useAuthStore } from "../../auth/authStore";
import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { addSpacesToCamelCase, formatDateTime } from "../../util/util";

type TabFilter = "available" | "mine";

export default function TechnicianVisitsPage() {
	const { user } = useAuthStore();
	const navigate = useNavigate();

	const [tab, setTab] = useState<TabFilter>("mine");
	const [searchInput, setSearchInput] = useState("");
	const [acceptError, setAcceptError] = useState<string | null>(null);

	const { data: visits, isLoading, error } = useAllJobVisitsQuery();
	const acceptMutation = useAcceptJobVisitMutation();

	const myTechId = useMemo(() => {
		const token = localStorage.getItem("accessToken");
		if (!token) return "";
		try {
			const payload = JSON.parse(atob(token.split(".")[1]));
			return payload.uid ?? "";
		} catch {
			return "";
		}
	}, []);

	const display = useMemo(() => {
		if (!visits) return [];

		let filtered = visits.filter(
			(v) => v.status !== "Completed" && v.status !== "Cancelled"
		);

		if (tab === "available") {
			filtered = filtered.filter((v) => (v.visit_techs?.length ?? 0) === 0);
		} else {
			filtered = filtered.filter((v) =>
				v.visit_techs?.some((vt) => vt.tech?.name === user?.name)
			);
		}

		if (searchInput.trim()) {
			const lower = searchInput.toLowerCase();
			filtered = filtered.filter(
				(v) =>
					(v.name ?? "").toLowerCase().includes(lower) ||
					(v.job?.client?.name ?? "").toLowerCase().includes(lower) ||
					(v.job?.address ?? "").toLowerCase().includes(lower) ||
					v.status.toLowerCase().includes(lower)
			);
		}

		return filtered
			.map((v) => ({
				id: v.id,
				visitName: v.name || "Unnamed Visit",
				client: v.job?.client?.name ?? "—",
				address: v.job?.address ?? "—",
				scheduled: formatDateTime(v.scheduled_start_at),
				status: addSpacesToCamelCase(v.status),
				_rawStatus: v.status as VisitStatus,
				_scheduleDate: new Date(v.scheduled_start_at),
			}))
			.sort((a, b) => {
				const statusDiff =
					VisitStatusValues.indexOf(a._rawStatus) -
					VisitStatusValues.indexOf(b._rawStatus);
				if (statusDiff !== 0) return statusDiff;
				return a._scheduleDate.getTime() - b._scheduleDate.getTime();
			})
			.map(({ _rawStatus, _scheduleDate, ...rest }) => rest);
	}, [visits, tab, searchInput, user?.name]);

	const handleAccept = async (e: React.MouseEvent, visitId: string) => {
		e.stopPropagation();
		setAcceptError(null);
		try {
			await acceptMutation.mutateAsync({ visitId, techId: myTechId });
			setTab("mine");
		} catch (err) {
			setAcceptError(err instanceof Error ? err.message : "Failed to accept visit.");
		}
	};

	return (
		<div className="text-white">
			<div className="flex flex-wrap items-center justify-between gap-4 mb-4">
				<h2 className="text-2xl font-semibold">My Visits</h2>
				<form onSubmit={(e) => e.preventDefault()} className="relative w-64">
					<Search
						size={18}
						className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"
					/>
					<input
						type="text"
						placeholder="Search visits..."
						value={searchInput}
						onChange={(e) => setSearchInput(e.target.value)}
						className="w-full pl-11 pr-3 py-2 rounded-md bg-zinc-800 border border-zinc-700 text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
					/>
				</form>
			</div>

			<div className="mb-3 flex gap-2">
				<button
					onClick={() => setTab("mine")}
					className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
						tab === "mine"
							? "bg-blue-600 text-white"
							: "bg-zinc-800 text-zinc-400 hover:bg-zinc-700"
					}`}
				>
					My Visits
				</button>
				<button
					onClick={() => setTab("available")}
					className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
						tab === "available"
							? "bg-blue-600 text-white"
							: "bg-zinc-800 text-zinc-400 hover:bg-zinc-700"
					}`}
				>
					Available Jobs
				</button>
			</div>

			{acceptError && (
				<div className="mb-3 px-4 py-3 bg-red-900/40 border border-red-500/40 rounded-lg text-red-300 text-sm">
					{acceptError}
				</div>
			)}

			<div className="shadow-sm border border-zinc-800 p-3 bg-zinc-900 rounded-lg overflow-hidden">
				<style>{`table td { white-space: pre-line; }`}</style>
				<AdaptableTable
					data={display}
					loadListener={isLoading}
					errListener={error}
					onRowClick={(row) => navigate(`/technician/visits/${row.id}`)}
					actionColumn={
						tab === "available"
							? {
									header: "",
									cell: (row) => (
										<button
											onClick={(e) => handleAccept(e, row.id as string)}
											disabled={acceptMutation.isPending}
											className="px-3 py-1.5 bg-green-600 hover:bg-green-700 rounded-md text-xs font-medium disabled:opacity-50 transition-colors"
										>
											Accept
										</button>
									),
								}
							: undefined
					}
				/>
			</div>
		</div>
	);
}
