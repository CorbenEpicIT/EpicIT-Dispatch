import React, { useRef, useLayoutEffect, useMemo, useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
	Briefcase,
	Phone,
	FileText,
	ReceiptText,
	Repeat,
	User,
	Activity,
	AlertCircle,
	ChevronRight,
	Loader2,
} from "lucide-react";
import Card from "../ui/Card";
import { useActivityFeed } from "../../hooks/useActivityFeed";
import { formatActivity, resolveRoute, timeAgo } from "./activityFormat";
import { useAuthStore } from "../../auth/authStore";
import { FALLBACK_TIMEZONE } from "../../util/util";

const FEED_FILTERS = [
	{
		key: "technicians",
		icon: User,
		label: "Technicians",
		color: "text-violet-400",
		bg: "bg-violet-500/10",
		eventTypes: new Set(["technician.updated"]),
	},
	{
		key: "requests",
		icon: Phone,
		label: "Requests",
		color: "text-orange-400",
		bg: "bg-orange-500/10",
		eventTypes: new Set(["request.created", "request.updated"]),
	},
	{
		key: "quotes",
		icon: FileText,
		label: "Quotes",
		color: "text-blue-400",
		bg: "bg-blue-500/10",
		eventTypes: new Set(["quote.created", "quote.updated"]),
	},
	{
		key: "jobs",
		icon: Briefcase,
		label: "Jobs",
		color: "text-amber-400",
		bg: "bg-amber-500/10",
		eventTypes: new Set([
			"job.created",
			"job_visit.created",
			"job_visit.updated",
			"job_visit.technicians_assigned",
		]),
	},
	{
		key: "recurring",
		icon: Repeat,
		label: "Recurring",
		color: "text-indigo-400",
		bg: "bg-indigo-500/10",
		eventTypes: new Set(["recurring_plan.created", "recurring_occurrence.generated"]),
	},
	{
		key: "invoices",
		icon: ReceiptText,
		label: "Invoices",
		color: "text-green-400",
		bg: "bg-green-500/10",
		eventTypes: new Set(["invoice.created", "invoice.updated", "invoice_payment.created"]),
	},
] as const;

const ITEM_HEIGHT_ESTIMATE = 60;

export default function ActivityFeed() {
	const navigate = useNavigate();
	const { user } = useAuthStore();
	const tz = user?.orgTimezone ?? FALLBACK_TIMEZONE;

	const {
		logs,
		activeFilters,
		toggleFilter,
		isLoading,
		isError,
		isFetchingMore,
		hasMore,
		loadMore,
		newItemSignal,
		socketConnected,
	} = useActivityFeed();

	const scrollRef = useRef<HTMLDivElement>(null);
	const [flashIds, setFlashIds] = useState<Set<string>>(new Set());

	// Scroll anchor: adjust scrollTop when new item prepended and user isn't at top
	useLayoutEffect(() => {
		const el = scrollRef.current;
		if (!el || el.scrollTop === 0) return;
		el.scrollTop += ITEM_HEIGHT_ESTIMATE;
	}, [newItemSignal]);

	// Flash newest item when signal fires
	useEffect(() => {
		if (newItemSignal === 0 || logs.length === 0) return;
		const id = logs[0].id;
		setFlashIds((prev) => new Set(prev).add(id));
		const t = setTimeout(() => {
			setFlashIds((prev) => {
				const next = new Set(prev);
				next.delete(id);
				return next;
			});
		}, 600);
		return () => clearTimeout(t);
	}, [newItemSignal]); // eslint-disable-line react-hooks/exhaustive-deps

	const activeEventTypes = useMemo<Set<string>>(
		() =>
			new Set(
				FEED_FILTERS.filter((f) => activeFilters.has(f.key)).flatMap((f) => [
					...f.eventTypes,
				])
			),
		[activeFilters]
	);

	const statusIndicator = (
		<div className="flex items-center gap-1.5 flex-shrink-0">
			<div
				aria-hidden="true"
				className={`w-1.5 h-1.5 rounded-full ${
					socketConnected ? "bg-emerald-500" : "bg-amber-500"
				}`}
			/>
			<span className={`text-xs font-medium ${socketConnected ? "text-emerald-400" : "text-amber-400"}`}>
				{socketConnected ? "Live" : "Reconnecting…"}
			</span>
		</div>
	);

	return (
		<Card title="Live Activity Feed" className="h-full" headerAction={statusIndicator}>
			{/* Filter strip — full card width, always visible */}
			<div className="flex flex-wrap items-center gap-1 -mx-4 px-4 pb-3 mb-1 border-b border-zinc-800/60">
				{FEED_FILTERS.map((f) => {
					const active = activeFilters.has(f.key);
					const Icon = f.icon;
					return (
						<button
							key={f.key}
							onClick={() => toggleFilter(f.key)}
							aria-pressed={active}
							className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors ${
								active
									? `${f.bg} ${f.color}`
									: "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/60"
							}`}
						>
							<Icon size={11} aria-hidden="true" />
							{f.label}
						</button>
					);
				})}
			</div>

			{isLoading ? (
				<div className="space-y-1">
					{Array.from({ length: 6 }).map((_, i) => (
						<div key={i} className="flex items-start gap-3 p-3">
							<div className="flex-shrink-0 w-8 h-8 rounded-lg bg-zinc-800/70 animate-pulse" />
							<div className="flex-1 space-y-2 pt-0.5">
								<div
									className="h-3.5 bg-zinc-800/70 rounded animate-pulse"
									style={{ width: `${55 + (i % 4) * 10}%` }}
								/>
								<div className="h-2.5 bg-zinc-800/50 rounded animate-pulse w-14" />
							</div>
						</div>
					))}
				</div>
			) : isError ? (
				<div className="flex flex-col items-center justify-center py-10 gap-2">
					<AlertCircle size={20} className="text-red-400/60" />
					<p className="text-sm text-red-400">Failed to load activity</p>
				</div>
			) : (
				<>
					<div
						ref={scrollRef}
						className="space-y-0.5 overflow-y-auto max-h-[510px] activity-scroll"
					>
						{(() => {
							const visible = logs
								.filter((log) => activeEventTypes.has(log.event_type))
								.map((log) => ({
									log,
									entry: formatActivity(log, tz),
									route: resolveRoute(log),
								}))
								.filter(({ entry }) => entry !== null);

							if (visible.length === 0) {
								return (
									<div className="flex flex-col items-center justify-center py-10 gap-2">
										<Activity size={20} className="text-zinc-600" />
										<p className="text-sm text-zinc-500">
											{logs.length === 0 ? "No recent activity" : "No matching activity"}
										</p>
									</div>
								);
							}

							return visible.map(({ log, entry, route }) => {
								const Icon = entry!.icon;
								const isFlashing = flashIds.has(log.id);
								const showActor = log.actor_name && log.actor_type !== "system";
								return (
									<div
										key={log.id}
										onClick={route ? () => navigate(route) : undefined}
										className={`flex items-center gap-3 p-3 rounded-lg hover:bg-zinc-800/40 transition-colors group${route ? " cursor-pointer" : ""}`}
										style={
											isFlashing
												? { animation: "feedFlash 600ms ease-out forwards" }
												: undefined
										}
									>
										<div
											className={`flex-shrink-0 w-8 h-8 rounded-lg ${entry!.bg} flex items-center justify-center`}
										>
											<Icon size={14} className={entry!.color} />
										</div>
										<div className="flex-1 min-w-0">
											<div className="flex items-start justify-between gap-2">
												<p className="text-sm text-zinc-200 group-hover:text-white transition-colors leading-snug truncate">
													{entry!.message}
												</p>
												<span className="text-xs text-zinc-600 flex-shrink-0 pt-px">
													{timeAgo(log.timestamp)}
												</span>
											</div>
											{entry!.subtitle ? (
												<p className="text-xs text-zinc-500 mt-0.5 truncate">
													{entry!.subtitle}
												</p>
											) : showActor ? (
												<p className="text-xs text-zinc-500 mt-0.5 truncate">
													{log.actor_name}
												</p>
											) : null}
										</div>
										{route && (
											<ChevronRight
												size={13}
												className="flex-shrink-0 text-zinc-700 group-hover:text-zinc-400 transition-colors"
											/>
										)}
									</div>
								);
							});
						})()}
					</div>

					{hasMore && (
						<button
							onClick={loadMore}
							disabled={isFetchingMore}
							className="mt-2 w-full bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 disabled:cursor-not-allowed text-sm text-zinc-400 rounded-lg py-2 flex items-center justify-center gap-2 transition-colors"
						>
							{isFetchingMore ? (
								<>
									<Loader2 size={14} className="animate-spin" />
									Loading…
								</>
							) : (
								"Load older activity"
							)}
						</button>
					)}
				</>
			)}
		</Card>
	);
}
