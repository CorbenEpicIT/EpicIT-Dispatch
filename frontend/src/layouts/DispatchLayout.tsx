import { Outlet, useNavigate, useLocation } from "react-router-dom";
import { useAuthStore } from "../auth/authStore";
import { useRef, useEffect, useState } from "react";
import {
	House,
	Calendar,
	Users,
	FileText,
	Wrench,
	ChartColumnDecreasing,
	Settings,
	Package,
	Map,
	ArrowLeft,
	Phone,
	Briefcase,
	ReceiptText,
	ShieldUser,
} from "lucide-react";
import SideNavItem from "../components/nav/SideNavItem";
import GlobalSearch from "../components/nav/GlobalSearch";
import { isAdmin } from "../util/util";

export default function DispatchLayout() {
	const { logout } = useAuthStore();
	const navigate = useNavigate();
	const location = useLocation();
	const navigationCount = useRef(0);
	const [expanded, setExpanded] = useState(false);
	const { user } = useAuthStore();

	useEffect(() => {
		navigationCount.current++;
	}, [location.pathname]);

	const handleBack = () => {
		const path = location.pathname;
		const historyIdx = (window.history.state as { idx?: number } | null)?.idx ?? 0;

		if (navigationCount.current > 1 && historyIdx > 0) {
			navigate(-1);
			return;
		}

		if (path.includes("/technicians/")) navigate("/dispatch/technicians");
		else if (path.includes("/clients/")) navigate("/dispatch/clients");
		else if (path.includes("/jobs/")) navigate("/dispatch/jobs");
		else if (path.includes("/quotes/")) navigate("/dispatch/quotes");
		else if (path.includes("/inventory/")) navigate("/dispatch/inventory");
		else if (path.includes("/admin/")) navigate("/dispatch/admin");
		else navigate("/dispatch");
	};

	const handleLogout = () => {
		logout();
		navigate("/login");
	};

	const ICON_SIZE = 20;

	return (
		<div className="flex h-screen bg-zinc-950 text-white">
			{/* SIDEBAR */}
			<aside
				onMouseEnter={() => setExpanded(true)}
				onMouseLeave={() => setExpanded(false)}
				className={`
					flex flex-col flex-shrink-0
					border-r border-zinc-900
					transition-all duration-300 ease-in-out
					${expanded ? "w-40 lg:w-44" : "w-16"}`}
			>
				<nav className="flex-1 py-2 space-y-1">
					<SideNavItem
						expanded={expanded}
						to="/dispatch"
						icon={<House size={ICON_SIZE} />}
						label="Dashboard"
					/>
					<SideNavItem
						expanded={expanded}
						to="/dispatch/requests"
						icon={<Phone size={ICON_SIZE} />}
						label="Requests"
					/>
					<SideNavItem
						expanded={expanded}
						to="/dispatch/quotes"
						icon={<FileText size={ICON_SIZE} />}
						label="Quotes"
					/>
					<SideNavItem
						expanded={expanded}
						to="/dispatch/jobs"
						icon={<Briefcase size={ICON_SIZE} />}
						label="Jobs"
					/>
					<SideNavItem
						expanded={expanded}
						to="/dispatch/schedule"
						icon={<Calendar size={ICON_SIZE} />}
						label="Schedule"
					/>
					<SideNavItem
						expanded={expanded}
						to="/dispatch/clients"
						icon={<Users size={ICON_SIZE} />}
						label="Clients"
					/>
					<SideNavItem
						expanded={expanded}
						to="/dispatch/inventory"
						icon={<Package size={ICON_SIZE} />}
						label="Inventory"
					/>
					<SideNavItem
						expanded={expanded}
						to="/dispatch/technicians"
						icon={<Wrench size={ICON_SIZE} />}
						label="Technicians"
					/>
					<SideNavItem
						expanded={expanded}
						to="/dispatch/map"
						icon={<Map size={ICON_SIZE} />}
						label="Map"
					/>
					<SideNavItem
						expanded={expanded}
						to="/dispatch/invoices"
						icon={<ReceiptText size={ICON_SIZE} />}
						label="Invoices"
					/>
					<SideNavItem
						expanded={expanded}
						to="/dispatch/reporting"
						icon={<ChartColumnDecreasing size={ICON_SIZE} />}
						label="Reporting"
					/>
					<SideNavItem
						expanded={expanded}
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
								expanded={expanded}
							/>
						)
					}
				</nav>
			</aside>

			<div className="flex flex-col flex-1 overflow-hidden">
				{/* TOP NAV */}
				<header className="flex justify-between items-center px-6 h-14 bg-zinc-950 border-b border-zinc-900">
					<div className="flex items-center gap-6">
						<div className="font-semibold text-sm whitespace-nowrap">
							Dispatch Demo
						</div>
						<button
							onClick={handleBack}
							className="flex items-center gap-2 text-zinc-400 hover:text-white px-3 py-2 rounded-lg hover:bg-zinc-800 group"
						>
							<ArrowLeft
								size={18}
								className="group-hover:-translate-x-1 transition-transform"
							/>
							<span className="text-sm font-medium">
								Back
							</span>
						</button>
					</div>

					{/* RIGHT SIDE */}
					<div className="flex items-center gap-3">
						<GlobalSearch />

						<button
							onClick={handleLogout}
							className="text-sm bg-red-500 px-3 py-1.5 rounded hover:bg-red-600"
						>
							Logout
						</button>
					</div>
				</header>

				<main className="flex-1 overflow-y-auto bg-zinc-950">
					<div className="p-4 md:p-6 min-h-full">
						<Outlet />
					</div>
				</main>
			</div>
		</div>
	);
}
