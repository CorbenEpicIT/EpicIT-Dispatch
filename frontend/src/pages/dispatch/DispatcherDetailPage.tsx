import { useDispatcherByIdQuery } from "../../hooks/useDispatchers";
import EditDispatcher from "../../components/dispatchers/EditDispatcher";
import { groupPermissionsByCategory } from "../../lib/permissionCatalogs";
import { useNavigate, useParams } from "react-router-dom";
import { useState } from "react";
import { usePermission } from "../../hooks/usePermission";
import { useQuery } from "@tanstack/react-query";
import { getRecentLogs } from "../../api/logs";
import { formatActivity, resolveRoute, timeAgo } from "../../components/dashboard/activityFormat";
import { useAuthStore } from "../../auth/authStore";
import { FALLBACK_TIMEZONE } from "../../util/util";
import { Mail, Phone, Clock, ShieldCheck, CalendarDays } from "lucide-react";

const DispatcherDetailPage = () => {
	const { dispatcherId } = useParams();
	const { data: dispatcher, isLoading } = useDispatcherByIdQuery(dispatcherId!);
	const { user } = useAuthStore();
	const tz = user?.orgTimezone ?? FALLBACK_TIMEZONE;
	const navigate = useNavigate();
	const [editOpen, setEditOpen] = useState(false);

	const EDIT_DISPATCHER = usePermission("manage_dispatchers");

	const permissionGroups = groupPermissionsByCategory(
		dispatcher?.permissions ?? [],
		"dispatcher",
	);

	const { data: logsResult } = useQuery({
		queryKey: ["logs", "dispatcher", dispatcherId],
		queryFn: () => getRecentLogs(50),
		enabled: !!dispatcherId,
		staleTime: 60_000,
	});

	const activityLogs = (logsResult?.data ?? [])
		.filter((l) => l.actor_id === dispatcherId || l.entity_id === dispatcherId)
		.slice(0, 15);

	const initials = dispatcher?.name
		?.split(" ")
		.map((w) => w[0])
		.join("")
		.slice(0, 2)
		.toUpperCase() ?? "?";

	const formatLastLogin = (iso: string | null) => {
		if (!iso) return "Never";
		return new Date(iso).toLocaleDateString("en-US", {
			month: "short", day: "numeric", year: "numeric",
			hour: "numeric", minute: "2-digit", timeZone: tz,
		});
	};

	if (isLoading) {
		return (
			<div className="flex justify-center py-10">
				<span className="text-sm text-text-muted">Loading...</span>
			</div>
		);
	}

	if (!dispatcher) {
		return <p className="text-sm text-text-muted">Dispatcher not found.</p>;
	}

	return (
		<>
			<div className="max-w-5xl mx-auto space-y-6">
				{/* Hero card */}
				<div className="bg-base border border-border rounded-xl p-6">
					<div className="flex items-start gap-5">
						{/* Avatar */}
						<div className="w-16 h-16 rounded-xl bg-primary flex items-center justify-center text-on-primary font-bold text-xl shrink-0">
							{initials}
						</div>

						{/* Info */}
						<div className="flex-1 min-w-0">
							<div className="flex items-start justify-between gap-4">
								<div>
									<h1 className="text-xl font-bold text-text-primary leading-tight">
										{dispatcher.name}
									</h1>
									{dispatcher.title && (
										<p className="text-sm text-text-muted mt-0.5">{dispatcher.title}</p>
									)}
									{/* Badges */}
									<div className="flex flex-wrap gap-1.5 mt-2">
										<span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-primary-bg text-primary-text text-xs font-medium">
											<ShieldCheck size={11} />
											{dispatcher.role === "admin" ? "Admin" : "Dispatcher"}
										</span>
										{dispatcher.organization_role && (
											<span className="inline-flex items-center px-2 py-0.5 rounded-md bg-surface text-text-secondary text-xs font-medium border border-border-subtle">
												{dispatcher.organization_role.name}
											</span>
										)}
									</div>
								</div>
								<button
									disabled={!EDIT_DISPATCHER}
									title={!EDIT_DISPATCHER ? "You don't have permission to perform this action." : undefined}
									onClick={() => setEditOpen(true)}
									className="px-3 py-1.5 text-sm rounded-md bg-surface border border-border hover:border-border-strong transition-colors disabled:cursor-not-allowed disabled:opacity-40 shrink-0"
								>
									Edit
								</button>
							</div>

							{/* Contact + meta row */}
							<div className="flex flex-wrap gap-x-5 gap-y-1.5 mt-3">
								<span className="flex items-center gap-1.5 text-sm text-text-muted">
									<Mail size={13} className="shrink-0" />
									{dispatcher.email}
								</span>
								{dispatcher.phone && (
									<span className="flex items-center gap-1.5 text-sm text-text-muted">
										<Phone size={13} className="shrink-0" />
										{dispatcher.phone}
									</span>
								)}
								<span className="flex items-center gap-1.5 text-sm text-text-muted">
									<Clock size={13} className="shrink-0" />
									Last login: {formatLastLogin(dispatcher.last_login)}
								</span>
							</div>

							{/* Description */}
							{dispatcher.description && (
								<p className="text-sm text-text-secondary mt-3 leading-relaxed max-w-prose">
									{dispatcher.description}
								</p>
							)}
						</div>
					</div>
				</div>

				{/* Two-column body */}
				<div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
					{/* Permissions */}
					<div>
						<h2 className="text-sm font-semibold text-text-primary mb-3">Permissions</h2>
						{permissionGroups.length === 0 ? (
							<p className="text-sm text-text-muted">No permissions assigned.</p>
						) : (
							<div className="space-y-2">
								{permissionGroups.map(({ category, permissions }) => (
									<div key={category} className="rounded-lg border border-border-subtle bg-base px-4 py-3">
										<p className="text-xs font-medium text-text-muted uppercase tracking-wide mb-2">
											{category}
										</p>
										<div className="flex flex-wrap gap-1.5">
											{permissions.map((p) => (
												<span
													key={p.id}
													className="px-2 py-0.5 rounded-md bg-surface text-xs text-text-secondary border border-border-subtle"
												>
													{p.label}
												</span>
											))}
										</div>
									</div>
								))}
							</div>
						)}
					</div>

					{/* Recent Activity */}
					<div>
						<h2 className="text-sm font-semibold text-text-primary mb-3">Recent Activity</h2>
						{activityLogs.length === 0 ? (
							<div className="rounded-lg border border-border-subtle bg-base px-4 py-8 text-center">
								<CalendarDays size={20} className="mx-auto text-text-muted mb-2" />
								<p className="text-sm text-text-muted">No recent activity.</p>
							</div>
						) : (
							<div className="rounded-lg border border-border-subtle bg-base divide-y divide-border-subtle overflow-hidden">
								{activityLogs.map((log) => {
									const entry = formatActivity(log, tz);
									if (!entry) return null;
									const route = resolveRoute(log);
									return (
										<div
											key={log.id}
											onClick={() => route && navigate(route)}
											className={`flex items-start gap-3 px-4 py-3 ${route ? "cursor-pointer hover:bg-surface-raised transition-colors" : ""}`}
										>
											<div className={`w-7 h-7 rounded-lg ${entry.bg} flex items-center justify-center shrink-0 mt-0.5`}>
												<entry.icon size={13} className={entry.color} />
											</div>
											<div className="min-w-0 flex-1">
												<p className="text-sm text-text-primary leading-snug">{entry.message}</p>
												{entry.subtitle && (
													<p className="text-xs text-text-muted mt-0.5 truncate">{entry.subtitle}</p>
												)}
											</div>
											<span className="text-xs text-text-muted shrink-0 pt-0.5">{timeAgo(log.timestamp)}</span>
										</div>
									);
								})}
							</div>
						)}
					</div>
				</div>
			</div>

			{editOpen && (
				<EditDispatcher
					dispatcher={dispatcher}
					onClose={() => setEditOpen(false)}
					isOpen={editOpen}
				/>
			)}
		</>
	);
};

export default DispatcherDetailPage;
