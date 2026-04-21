import { useState, useEffect } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { useClientVisitHistoryQuery } from "../../hooks/useJobs";
import { useAuthStore } from "../../auth/authStore";
import { FALLBACK_TIMEZONE } from "../../util/util";
import { VisitStatusColors, type VisitStatus } from "../../types/jobs";

function formatShortDate(dateStr: Date | string, tz: string): string {
	return new Date(dateStr).toLocaleDateString("en-US", {
		month: "short",
		day: "numeric",
		year: "numeric",
		timeZone: tz,
	});
}

export default function CustomerHistorySection({
	clientId,
	currentVisitId,
}: {
	clientId: string;
	currentVisitId: string;
}) {
	const { user } = useAuthStore();
	const tz = user?.orgTimezone ?? FALLBACK_TIMEZONE;
	const [open, setOpen] = useState(false);
	const [visibleCount, setVisibleCount] = useState(5);

	useEffect(() => {
		if (!open) setVisibleCount(5);
	}, [open]);

	const { data: history = [], isLoading } = useClientVisitHistoryQuery(
		open ? clientId : null,
		25,
	);

	const filtered = history.filter((v) => v.id !== currentVisitId);
	const visibleVisits = filtered.slice(0, visibleCount);

	return (
		<div className="rounded-xl border border-zinc-800 overflow-hidden">
			<button
				onClick={() => setOpen((p) => !p)}
				aria-expanded={open}
				aria-controls="customer-history-panel"
				className="w-full flex items-center justify-between px-4 py-3 bg-zinc-900/60"
			>
				<span className="text-xs font-semibold text-zinc-300 uppercase tracking-wide">
					Client History
				</span>
				<div className="flex items-center gap-2">
					{filtered.length > 0 && (
						<span className="text-[11px] text-zinc-500">{filtered.length} recent visits</span>
					)}
					{open ? (
						<ChevronUp size={14} className="text-zinc-500" />
					) : (
						<ChevronDown size={14} className="text-zinc-500" />
					)}
				</div>
			</button>

			{open && (
				<div id="customer-history-panel" className="border-t border-zinc-800">
					{isLoading ? (
						<div className="flex justify-center py-6">
							<div className="w-5 h-5 rounded-full border-2 border-zinc-700 border-t-blue-500 animate-spin" />
						</div>
					) : filtered.length === 0 ? (
						<p className="px-4 py-5 text-center text-sm text-zinc-600">No prior visits</p>
					) : (
						<div className="divide-y divide-zinc-800/60">
							{visibleVisits.map((visit) => {
								const firstNote = visit.notes?.[0];
								const techName = visit.visit_techs?.[0]?.tech?.name;
								return (
									<div key={visit.id} className="px-4 py-3">
										<div className="flex items-start justify-between gap-3">
											<div className="flex-1 min-w-0">
												<p className="text-sm font-medium text-white truncate">
													{visit.name ?? "Visit"}
												</p>
												{techName && (
													<p className="text-[11px] text-zinc-600">{techName}</p>
												)}
												{firstNote && (
													<p className="text-xs text-zinc-500 mt-0.5 line-clamp-1">
														{firstNote.content}
													</p>
												)}
											</div>
											<div className="text-right shrink-0">
												<span
													className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium border ${
														VisitStatusColors[visit.status as VisitStatus] ??
														"bg-zinc-500/20 text-zinc-400 border-zinc-500/30"
													}`}
												>
													{visit.status}
												</span>
												<p className="text-[11px] text-zinc-600 mt-1">
													{formatShortDate(visit.scheduled_start_at, tz)}
												</p>
											</div>
										</div>
									</div>
								);
							})}
							{visibleCount < filtered.length && (
								<button
									onClick={() => setVisibleCount((c) => Math.min(c + 5, filtered.length))}
									className="px-4 py-2.5 w-full flex items-center justify-center gap-1.5 text-xs text-blue-400 hover:bg-zinc-800/40 transition-colors"
								>
									<ChevronDown size={13} />
									Load 5 more
								</button>
							)}
						</div>
					)}
				</div>
			)}
		</div>
	);
}
