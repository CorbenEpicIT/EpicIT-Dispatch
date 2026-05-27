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
	Truck,
} from "lucide-react";
import SideNavItem from "../components/nav/SideNavItem";
import GlobalSearch from "../components/nav/GlobalSearch";
import { usePermission, useAnyPermission } from "../hooks/usePermission";
import { queryClient } from "../main";

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
		queryClient.clear();
		navigate("/login");
	};

	const ICON_SIZE = 20;

	return (
		<div className="flex h-screen bg-canvas text-white">
			{/* SIDEBAR */}
			<aside
				onMouseEnter={() => setExpanded(true)}
				onMouseLeave={() => setExpanded(false)}
				className={`
					flex flex-col flex-shrink-0 overflow-hidden
					border-r border-zinc-900
					transition-all duration-300 ease-in-out
					${expanded ? "w-40 lg:w-44" : "w-16"}`}
			>
				<nav className="flex-1 py-2 space-y-1 overflow-y-auto overflow-x-hidden sidebar-nav">
					<SideNavItem
						expanded={expanded}
						to="/dispatch"
						icon={<House size={ICON_SIZE} />}
						label="Dashboard"
					/>
					<SideNavItem
						expanded={expanded}
						to="/dispatch/schedule"
						icon={<Calendar size={ICON_SIZE} />}
						label="Schedule"
					/>
					{usePermission("view_requests") && (
						<SideNavItem
							expanded={expanded}
							to="/dispatch/requests"
							icon={<Phone size={ICON_SIZE} />}
							label="Requests"
						/>
					)}
					{usePermission("view_quotes") && (
						<SideNavItem
							expanded={expanded}
							to="/dispatch/quotes"
							icon={<FileText size={ICON_SIZE} />}
							label="Quotes"
						/>
					)}
					{usePermission("view_jobs") && (
						<SideNavItem
							expanded={expanded}
							to="/dispatch/jobs"
							icon={<Briefcase size={ICON_SIZE} />}
							label="Jobs"
						/>
					)}
					{usePermission("view_invoices") && (
						<SideNavItem
							expanded={expanded}
							to="/dispatch/invoices"
							icon={<ReceiptText size={ICON_SIZE} />}
							label="Invoices"
						/>
					)}
					{usePermission("view_clients") && (
						<SideNavItem
							expanded={expanded}
							to="/dispatch/clients"
							icon={<Users size={ICON_SIZE} />}
							label="Clients"
						/>
					)}
					{usePermission("view_inventory") && (
						<SideNavItem
							expanded={expanded}
							to="/dispatch/inventory"
							icon={<Package size={ICON_SIZE} />}
							label="Inventory"
						/>
					)}
					{useAnyPermission(["view_inventory", "manage_technicians"]) && (
						<SideNavItem
							expanded={expanded}
							to="/dispatch/vehicles"
							icon={<Truck size={ICON_SIZE} />}
							label="Vehicles"
						/>
					)}
					{usePermission("view_technicians") && (
						<SideNavItem
							expanded={expanded}
							to="/dispatch/technicians"
							icon={<Wrench size={ICON_SIZE} />}
							label="Technicians"
						/>
					)}
					<SideNavItem
						expanded={expanded}
						to="/dispatch/map"
						icon={<Map size={ICON_SIZE} />}
						label="Map"
					/>
					{usePermission("view_reports") && (
						<SideNavItem
							expanded={expanded}
							to="/dispatch/reporting"
							icon={<ChartColumnDecreasing size={ICON_SIZE} />}
							label="Reporting"
						/>
					)}
					{(user?.role === "admin" || useAnyPermission(["view_admin", "manage_organization", "manage_roles"])) && (
						<SideNavItem
							expanded={expanded}
							to="/dispatch/admin"
							icon={<ShieldUser size={ICON_SIZE} />}
							label="Admin"
						/>
					)}
				</nav>
			</aside>

			<div className="flex flex-col flex-1 overflow-hidden">
				{/* TOP NAV */}
				<header className="flex justify-between items-center px-6 h-14 bg-canvas border-b border-zinc-900">
					<div className="flex items-center gap-6">
						<div className="font-semibold text-sm whitespace-nowrap">
							Dispatch Demo
						</div>
						<button
							onClick={handleBack}
							className="flex items-center gap-2 text-text-tertiary hover:text-white px-3 py-2 rounded-lg hover:bg-surface group"
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

				<main className="flex-1 overflow-hidden bg-canvas">
					<div className="p-4 md:p-6 h-full overflow-y-auto">
						<Outlet />
					</div>
				</main>
			</div>
		</div>
	);
}
