import {
	useAllJobVisitsQuery,
	useAcceptJobVisitMutation,
	useVisitTransitionMutation,
} from "../../hooks/useJobs";
import { LIFECYCLE_TRANSITIONS, VisitStatusLabels, type VisitStatus, type LifecycleAction } from "../../types/jobs";
import { useAuthStore } from "../../auth/authStore";
import { useMemo, useState } from "react";
import { Search, Car, MapPin, Play, Pause, CheckCircle2, Calendar } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { formatDateTime } from "../../util/util";

type TabFilter = "available" | "mine" | "past";

type ConfirmAction = { visitId: string; action: LifecycleAction } | null;

export default function TechnicianVisitsPage() {
	const { user } = useAuthStore();
	const navigate = useNavigate();

	const [tab, setTab] = useState<TabFilter>("mine");
	const [searchInput, setSearchInput] = useState("");
	const [acceptError, setAcceptError] = useState<string | null>(null);
	const [acceptConfirm, setAcceptConfirm] = useState<string | null>(null);
	const [confirmAction, setConfirmAction] = useState<ConfirmAction>(null);
	const [showAllPast, setShowAllPast] = useState(false);

	const { data: visits, isLoading, error } = useAllJobVisitsQuery();
	const acceptMutation = useAcceptJobVisitMutation();
	const transitionMutation = useVisitTransitionMutation();

	const anyLifecyclePending = transitionMutation.isPending;

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

		let filtered = visits;

		if (tab === "past") {
			filtered = filtered
				.filter((v) => v.status === "Completed" || v.status === "Cancelled")
				.filter((v) => v.visit_techs?.some((vt) => vt.tech?.email === user?.name));
		} else if (tab === "available") {
			filtered = filtered
				.filter((v) => v.status !== "Completed" && v.status !== "Cancelled")
				.filter((v) => (v.visit_techs?.length ?? 0) === 0);
		} else {
			filtered = filtered
				.filter((v) => v.status !== "Completed" && v.status !== "Cancelled")
				.filter((v) => v.visit_techs?.some((vt) => vt.tech?.email === user?.name));
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

		const statusPriority: Record<string, number> = {
			InProgress: 0,
			Paused: 1,
			OnSite: 2,
			Driving: 3,
			Scheduled: 4,
			Delayed: 5,
		};

		const sorted = tab === "past"
			? [...filtered].sort((a, b) =>
				new Date(b.scheduled_start_at).getTime() - new Date(a.scheduled_start_at).getTime()
			)
			: [...filtered].sort((a, b) => {
				const aPriority = statusPriority[a.status] ?? 99;
				const bPriority = statusPriority[b.status] ?? 99;
				if (aPriority !== bPriority) return aPriority - bPriority;
				return new Date(a.scheduled_start_at).getTime() - new Date(b.scheduled_start_at).getTime();
			});

		return sorted.map((v) => ({
			id: v.id,
			visitName: v.name || "Unnamed Visit",
			client: v.job?.client?.name ?? "—",
			address: v.job?.address ?? "—",
			scheduled: formatDateTime(v.scheduled_start_at),
			rawStatus: v.status as VisitStatus,
		}));
	}, [visits, tab, searchInput, user?.name]);

	const cardData = tab === "past" && !showAllPast ? display.slice(0, 5) : display;

	const handlePastTab = () => {
		setTab("past");
		setAcceptConfirm(null);
		setAcceptError(null);
		setShowAllPast(false);
	};

	const handleAccept = async (e: React.MouseEvent, visitId: string) => {
		e.stopPropagation();
		setAcceptError(null);
		if (acceptConfirm !== visitId) {
			setAcceptConfirm(visitId);
			return;
		}
		try {
			await acceptMutation.mutateAsync({ visitId, techId: myTechId });
			setAcceptConfirm(null);
			setTab("mine");
		} catch (err) {
			setAcceptError(err instanceof Error ? err.message : "Failed to accept visit.");
		}
	};

	const handleLifecycle = async (
		e: React.MouseEvent,
		visitId: string,
		action: LifecycleAction,
		needsConfirm: boolean,
	) => {
		e.stopPropagation();
		if (needsConfirm && !(confirmAction?.visitId === visitId && confirmAction?.action === action)) {
			setConfirmAction({ visitId, action });
			return;
		}
		setConfirmAction(null);
		try {
			await transitionMutation.mutateAsync({ visitId, action });
		} catch (err) {
			console.error(`Failed to ${action} visit:`, err);
		}
	};

	const isConfirming = (visitId: string, action: string) =>
		confirmAction?.visitId === visitId && confirmAction?.action === action;

	const ACTION_ICONS: Partial<Record<LifecycleAction, React.ReactNode>> = {
		drive: <Car size={16} />,
		arrive: <MapPin size={16} />,
		start: <Play size={16} />,
		pause: <Pause size={16} />,
		resume: <Play size={16} />,
		complete: <CheckCircle2 size={16} />,
	};

	const renderLifecycleButtons = (visitId: string, status: VisitStatus) => {
		const transitions = LIFECYCLE_TRANSITIONS[status] ?? [];
		if (transitions.length === 0) return null;
		const btnBase = "flex items-center justify-center gap-2 w-full py-3 min-h-[44px] rounded-lg text-sm font-semibold disabled:opacity-50 transition-colors";

		return (
			<div
				className="flex flex-col gap-2"
				onClick={(e) => e.stopPropagation()}
				onMouseLeave={() => setConfirmAction(null)}
			>
				{transitions.map((t) => {
					const confirming = isConfirming(visitId, t.action);
					return (
						<button
							key={t.action}
							onClick={(e) => handleLifecycle(e, visitId, t.action, t.needsConfirm)}
							disabled={anyLifecyclePending}
							className={`${btnBase} ${confirming ? t.confirmColor : t.color}`}
						>
							{ACTION_ICONS[t.action]}
							{confirming ? t.confirmLabel : t.label}
						</button>
					);
				})}
			</div>
		);
	};

	return (
		<div className="text-white">
			{/* Header */}
			<div className="flex flex-col gap-3 mb-4">
				<h2 className="text-2xl font-semibold">My Visits</h2>
				<form onSubmit={(e) => e.preventDefault()} className="relative w-full">
					<Search
						size={18}
						className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"
					/>
					<input
						type="text"
						placeholder="Search visits..."
						value={searchInput}
						onChange={(e) => setSearchInput(e.target.value)}
						className="w-full pl-11 pr-3 py-2.5 rounded-md bg-zinc-800 border border-zinc-700 text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
					/>
				</form>
			</div>

			{/* Tab buttons */}
			<div className="mb-3 flex gap-2">
				<button
					onClick={() => setTab("mine")}
					className={`flex-1 px-4 py-3 min-h-[44px] rounded-md text-xs sm:text-sm font-medium transition-colors ${
						tab === "mine"
							? "bg-blue-600 text-white"
							: "bg-zinc-800 text-zinc-400 hover:bg-zinc-700"
					}`}
				>
					My Visits
				</button>
				<button
					onClick={() => setTab("available")}
					className={`flex-1 px-4 py-3 min-h-[44px] rounded-md text-xs sm:text-sm font-medium transition-colors ${
						tab === "available"
							? "bg-blue-600 text-white"
							: "bg-zinc-800 text-zinc-400 hover:bg-zinc-700"
					}`}
				>
					Available Jobs
				</button>
				<button
					onClick={handlePastTab}
					className={`flex-1 px-4 py-3 min-h-[44px] rounded-md text-xs sm:text-sm font-medium transition-colors ${
						tab === "past"
							? "bg-blue-600 text-white"
							: "bg-zinc-800 text-zinc-400 hover:bg-zinc-700"
					}`}
				>
					Past Visits
				</button>
			</div>

			{acceptError && (
				<div className="mb-3 px-4 py-3 bg-red-900/40 border border-red-500/40 rounded-lg text-red-300 text-sm">
					{acceptError}
				</div>
			)}

			{/* Card list */}
			{isLoading && (
				<p className="text-zinc-400 text-sm text-center py-8">Loading visits...</p>
			)}
			{error && (
				<p className="text-red-400 text-sm text-center py-8">Failed to load visits.</p>
			)}
			{!isLoading && !error && cardData.length === 0 && (
				<p className="text-zinc-500 text-sm text-center py-8">No visits found.</p>
			)}

			<div className="space-y-3">
				{cardData.map((row) => (
					<div
						key={row.id}
						className="bg-zinc-900 border border-zinc-700 rounded-xl p-4 shadow-sm cursor-pointer active:opacity-75 transition-opacity"
						onClick={() => navigate(`/technician/visits/${row.id}`)}
					>
						<h3 className="text-lg font-bold text-white mb-0.5">{row.visitName}</h3>
						<p className="text-sm text-zinc-400 mb-3">{row.client}</p>

						<div className="space-y-1.5 mb-4">
							<div className="flex items-start gap-2 text-sm text-zinc-300">
								<MapPin size={15} className="text-zinc-500 mt-0.5 shrink-0" />
								<span>{row.address}</span>
							</div>
							<div className="flex items-center gap-2 text-sm text-zinc-300">
								<Calendar size={15} className="text-zinc-500 shrink-0" />
								<span>{row.scheduled}</span>
							</div>
						</div>

						{tab === "available" && (
							<button
								onClick={(e) => handleAccept(e, row.id)}
								onMouseLeave={() => setAcceptConfirm(null)}
								disabled={acceptMutation.isPending}
								className={`w-full py-3 min-h-[44px] rounded-lg text-sm font-semibold transition-colors disabled:opacity-50 ${
									acceptConfirm === row.id
										? "bg-green-500 text-white animate-pulse"
										: "bg-green-600 hover:bg-green-700 text-white"
								}`}
							>
								{acceptMutation.isPending
									? "Accepting..."
									: acceptConfirm === row.id
										? "Tap Again to Confirm"
										: "Accept"}
							</button>
						)}

						{tab === "mine" && renderLifecycleButtons(row.id, row.rawStatus)}

						{tab === "past" && (
							<span className="inline-block px-2.5 py-1 rounded-md text-xs bg-zinc-800 text-zinc-400">
								{VisitStatusLabels[row.rawStatus]}
							</span>
						)}
					</div>
				))}
			</div>

			{tab === "past" && display.length > 5 && (
				<button
					onClick={() => setShowAllPast((prev) => !prev)}
					className="mt-3 w-full py-3 min-h-[44px] text-sm text-blue-400 hover:text-blue-300 transition-colors"
				>
					{showAllPast ? "Show less" : `View all ${display.length} past visits`}
				</button>
			)}
		</div>
	);
}
