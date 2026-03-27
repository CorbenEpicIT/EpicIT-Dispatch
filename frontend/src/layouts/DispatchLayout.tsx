import { Outlet, useNavigate, useLocation } from "react-router-dom";
import { useAuthStore } from "../auth/authStore";
import { useRef, useEffect } from "react";
import {
	House,
	Calendar,
	Users,
	FileText,
	Wrench,
	ChartColumnDecreasing,
	Settings,
	Search,
	Package,
	Map,
	ArrowLeft,
	Phone,
	Briefcase,
	ShieldUser,
} from "lucide-react";
import SideNavItem from "../components/nav/SideNavItem";
import { isAdmin } from "../util/util";

export default function DispatchLayout() {
	const { logout, user } = useAuthStore();
	const navigate = useNavigate();
	const location = useLocation();
	const navigationCount = useRef(0);

	// Track internal navigation
	useEffect(() => {
		navigationCount.current++;
	}, [location.pathname]);

	const handleBack = () => {
		const path = location.pathname;

		// Only use browser back if we've navigated internally more than once
		// AND the history stack has a safe entry to return to
		const historyIdx = (window.history.state as { idx?: number } | null)?.idx ?? 0;
		if (navigationCount.current > 1 && historyIdx > 0) {
			navigate(-1);
			return;
		}

		if (path.includes("/technicians/")) {
			navigate("/dispatch/technicians");
		} else if (path.includes("/clients/")) {
			navigate("/dispatch/clients");
		} else if (path.includes("/jobs/")) {
			navigate("/dispatch/jobs");
		} else if (path.includes("/quotes/")) {
			navigate("/dispatch/quotes");
		} else if (path.includes("/inventory/")) {
			navigate("/dispatch/inventory");
		}else if (path.includes("/admin/")) {
			navigate("/dispatch/admin");
		} else {
			navigate("/dispatch");
		}
	};

	// TODO logout
	const handleLogout = () => {
		logout();
		navigate("/login");
	};

	const ICON_SIZE = 20;

	return (
		<div className="flex h-screen bg-zinc-950 text-white">
			<aside className="w-64 border-r border-zinc-900 shadow-sm hidden md:flex flex-col">
				<div className="p-4 text-xl font-bold border-b border-zinc-900">
					Dispatch Demo
				</div>

				<nav className="flex-1 p-2 space-y-1">
					<SideNavItem
						to="/dispatch"
						icon={<House size={ICON_SIZE} />}
						label="Dashboard"
					/>
					<SideNavItem
						to="/dispatch/requests"
						icon={<Phone size={ICON_SIZE} />}
						label="Requests"
					/>
					<SideNavItem
						to="/dispatch/quotes"
						icon={<FileText size={ICON_SIZE} />}
						label="Quotes"
					/>
					<SideNavItem
						to="/dispatch/jobs"
						icon={<Briefcase size={ICON_SIZE} />}
						label="Jobs"
					/>
					<SideNavItem
						to="/dispatch/schedule"
						icon={<Calendar size={ICON_SIZE} />}
						label="Schedule"
					/>
					<SideNavItem
						to="/dispatch/clients"
						icon={<Users size={ICON_SIZE} />}
						label="Clients"
					/>
					<SideNavItem
						to="/dispatch/inventory"
						icon={<Package size={ICON_SIZE} />}
						label="Inventory"
					/>
					<SideNavItem
						to="/dispatch/technicians"
						icon={<Wrench size={ICON_SIZE} />}
						label="Technicians"
					/>
					<SideNavItem
						to="/dispatch/map"
						icon={<Map size={ICON_SIZE} />}
						label="Map"
					/>
					<SideNavItem
						to="/dispatch/reporting"
						icon={<ChartColumnDecreasing size={ICON_SIZE} />}
						label="Reporting"
					/>
					<SideNavItem
						to="/dispatch/settings"
						icon={<Settings size={ICON_SIZE} />}
						label="Settings"
					/>
					{/* Admin page only visible to dispatch role */
						user?.role === "dispatch" /*&& isAdmin(user?.role)*/ && (
							<SideNavItem
								to="/dispatch/admin"
								icon={<ShieldUser size={ICON_SIZE} />}
								label="Admin"
							/>
						)
					}
				</nav>
			</aside>

			<div className="flex flex-col flex-1 overflow-hidden">
				<header className="flex justify-between items-center px-6 py-3 bg-zinc-950 border-b border-zinc-900">
					{/* Left side - Back button */}
					<div className="flex items-center gap-3">
						<button
							onClick={handleBack}
							className="flex items-center gap-2 text-zinc-400 hover:text-white transition-all px-3 py-2 rounded-lg hover:bg-zinc-800 group"
						>
							<ArrowLeft
								size={18}
								className="group-hover:-translate-x-1 transition-transform duration-200"
							/>
							<span className="text-sm font-medium">
								Back
							</span>
						</button>
					</div>

					{/* Right side - Search & Logout */}
					<div className="flex items-center gap-3">
						<div className="relative w-80">
							<Search
								size={18}
								className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"
							/>

							<input
								type="text"
								placeholder="(TODO)Search clients, jobs or technicians..."
								className="w-full pl-10 pr-3 py-2 rounded-md bg-zinc-800 border border-zinc-700 text-sm 
                        text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-2 
                        focus:ring-blue-500"
							/>
						</div>

						<button
							onClick={handleLogout}
							className="text-sm bg-red-500 text-white px-3 py-1.5 rounded hover:bg-red-600"
						>
							Logout
						</button>
					</div>
				</header>

				<main className="flex-1 overflow-y-auto bg-zinc-950 relative">
					<div className="p-6 min-h-full">
						<Outlet />
					</div>
				</main>
			</div>
		</div>
	);
}
