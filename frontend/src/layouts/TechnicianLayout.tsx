import { Outlet, useNavigate, useLocation, NavLink } from "react-router-dom";
import { useAuthStore } from "../auth/authStore";
import { useRef, useEffect, useState, useCallback } from "react";
import { ClipboardList, ArrowLeft, House, Truck, Bell, AlertTriangle, Map, X } from "lucide-react";
import { useTechnicianByIdQuery } from "../hooks/useTechnicians";
import { useNotificationsQuery } from "../hooks/useNotifications";
import type { TechnicianNotification } from "../types/notifications";

export default function TechnicianLayout() {
	const { user, logout } = useAuthStore();
	const navigate = useNavigate();
	const location = useLocation();
	const navigationCount = useRef(0);

	const [notifBanner, setNotifBanner] = useState<TechnicianNotification | null>(null);
	const notifBannerTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	const handleNewNotification = useCallback((notif: TechnicianNotification) => {
		setNotifBanner(notif);
		if (notifBannerTimerRef.current) clearTimeout(notifBannerTimerRef.current);
		notifBannerTimerRef.current = setTimeout(() => setNotifBanner(null), 5000);
	}, []);

	useEffect(() => {
		return () => { if (notifBannerTimerRef.current) clearTimeout(notifBannerTimerRef.current); };
	}, []);

	const { data: techProfile } = useTechnicianByIdQuery(user?.userId ?? null);
	const { data: notifications = [] } = useNotificationsQuery(user?.userId ?? null, false, handleNewNotification);
	const unreadCount = notifications.filter((n) => !n.read_at).length;
	const noVehicle = techProfile && !techProfile.current_vehicle_id;

	useEffect(() => {
		navigationCount.current++;
	}, [location.pathname]);

	const handleBack = () => {
		const historyIdx = (window.history.state as { idx?: number } | null)?.idx ?? 0;
		if (navigationCount.current > 1 && historyIdx > 0) {
			navigate(-1);
			return;
		}
		navigate("/technician");
	};

	const [confirmingLogout, setConfirmingLogout] = useState(false);
	const logoutTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	const handleLogout = () => {
		if (!confirmingLogout) {
			setConfirmingLogout(true);
			logoutTimerRef.current = setTimeout(() => setConfirmingLogout(false), 3000);
			return;
		}
		if (logoutTimerRef.current) clearTimeout(logoutTimerRef.current);
		logout();
		navigate("/login");
	};

	return (
		<div className="flex h-screen bg-zinc-950 text-white">
			<div className="flex flex-col flex-1 overflow-hidden">
				{/* TOP NAV */}
				<header className="flex justify-between items-center px-4 sm:px-6 h-14 bg-zinc-950 border-b border-zinc-900">
					<div className="flex items-center gap-3 sm:gap-6">
						<button
							onClick={handleBack}
							className="flex items-center gap-2 text-zinc-400 hover:text-white px-2 sm:px-3 py-2 rounded-lg hover:bg-zinc-800 group"
						>
							<ArrowLeft
								size={18}
								className="group-hover:-translate-x-1 transition-transform"
							/>
							<span className="hidden sm:inline text-sm font-medium">
								Back
							</span>
						</button>
						<div className="font-semibold text-sm whitespace-nowrap">
							Tech Demo
						</div>
					</div>

					<div className="flex items-center gap-2">
						{/* Truck / vehicle icon */}
						<button
							onClick={() => navigate("/technician/vehicle")}
							className="relative flex items-center justify-center w-9 h-9 rounded-lg hover:bg-zinc-800 transition-colors"
							title={techProfile?.current_vehicle?.name ?? "No vehicle selected"}
						>
							<Truck
								size={20}
								className={noVehicle ? "text-amber-400" : "text-zinc-400"}
							/>
							{noVehicle && (
								<AlertTriangle
									size={10}
									className="absolute top-1 right-1 text-amber-400"
								/>
							)}
						</button>

						{/* Bell / notifications icon */}
						<button
							onClick={() => navigate("/technician/notifications")}
							className="relative flex items-center justify-center w-9 h-9 rounded-lg hover:bg-zinc-800 transition-colors"
							title="Notifications"
						>
							<Bell size={20} className="text-zinc-400" />
							{unreadCount > 0 && (
								<span className="absolute top-1 right-1 flex items-center justify-center w-4 h-4 rounded-full bg-red-500 text-white text-[9px] font-bold leading-none">
									{unreadCount > 9 ? "9+" : unreadCount}
								</span>
							)}
						</button>

						{user && (
							<span className="hidden sm:block text-sm text-zinc-400">
								{user.name}
							</span>
						)}
						<button
							onClick={handleLogout}
							onMouseLeave={() => { if (confirmingLogout) { if (logoutTimerRef.current) clearTimeout(logoutTimerRef.current); setConfirmingLogout(false); } }}
							className={`text-sm px-3 py-1.5 rounded transition-colors ${confirmingLogout ? "bg-red-600 text-white motion-safe:animate-pulse" : "bg-red-500 hover:bg-red-600 text-white"}`}
						>
							{confirmingLogout ? "Confirm Logout" : "Logout"}
						</button>
					</div>
				</header>

				{notifBanner && (
					<div className="flex items-start gap-2.5 pl-3 pr-4 py-2.5 bg-zinc-900 border-b border-zinc-800">
						<div className="w-0.5 self-stretch bg-blue-500 rounded-full shrink-0" />
						<button
							className="flex-1 min-w-0 text-left py-0.5"
							onClick={() => {
								if (notifBanner.action_url) navigate(notifBanner.action_url);
								setNotifBanner(null);
							}}
						>
							<p className="text-[13px] font-semibold text-white leading-snug truncate">{notifBanner.title}</p>
							{notifBanner.body && (
								<p className="text-xs text-zinc-400 leading-snug mt-0.5 line-clamp-2">{notifBanner.body}</p>
							)}
						</button>
						<button
							onClick={() => setNotifBanner(null)}
							className="shrink-0 text-zinc-500 hover:text-zinc-300 transition-colors mt-0.5"
						>
							<X size={14} />
						</button>
					</div>
				)}
				<main className="flex-1 overflow-y-auto bg-zinc-950">
					<div className="p-4 pb-20 md:px-6 md:pt-6 min-h-full">
						<Outlet />
					</div>
				</main>
			</div>

			{/* BOTTOM NAV */}
			<nav className="flex fixed bottom-0 left-0 right-0 z-50 bg-zinc-950 border-t border-zinc-900 h-16">
				<NavLink
					to="/technician"
					end
					className={({ isActive }) =>
						`flex flex-1 flex-col items-center justify-center gap-1 text-xs transition-colors ${
							isActive ? "text-white" : "text-zinc-500 hover:text-zinc-300"
						}`
					}
				>
					<House size={22} />
					<span>Dashboard</span>
				</NavLink>
				<NavLink
					to="/technician/visits"
					className={({ isActive }) =>
						`flex flex-1 flex-col items-center justify-center gap-1 text-xs transition-colors ${
							isActive ? "text-white" : "text-zinc-500 hover:text-zinc-300"
						}`
					}
				>
					<ClipboardList size={22} />
					<span>My Visits</span>
				</NavLink>
				<NavLink
					to="/technician/map"
					className={({ isActive }) =>
						`flex flex-1 flex-col items-center justify-center gap-1 text-xs transition-colors ${
							isActive ? "text-white" : "text-zinc-500 hover:text-zinc-300"
						}`
					}
				>
					<Map size={22} />
					<span>Map</span>
				</NavLink>
			</nav>
		</div>
	);
}
