import { Outlet, useNavigate, useLocation } from "react-router-dom";
import { useAuthStore } from "../auth/authStore";
import { useEffect, useState } from "react";
import {
	House,
	Calendar,
	Users,
	FileText,
	Wrench,
	ChartColumnDecreasing,
	Package,
	Map,
	ArrowLeft,
	Phone,
	Briefcase,
	ReceiptText,
	ShieldUser,
	Truck,
	UserRoundCog,
	Plus,
} from "lucide-react";
import SideNavItem from "../components/nav/SideNavItem";
import GlobalSearch from "../components/nav/GlobalSearch";
import { usePermission, useAnyPermission } from "../hooks/usePermission";
import DispatcherUserMenu from "../components/nav/DispatcherUserMenu";
import CreatePanel from "../components/nav/CreatePanel";
import ToastViewport from "../components/ui/ToastViewport";
import { useToast } from "../components/ui/useToast";
import { socket } from "../lib/socket";
import { useOrgSettings } from "../hooks/useOrg";
import { useSocketQuerySync } from "../hooks/useSocketQuerySync";
import type { VehicleRestockShortfallEvent } from "../types/socketEvents";

export default function DispatchLayout() {
	const { logout } = useAuthStore();
	const navigate = useNavigate();
	const location = useLocation();
	const toast = useToast();
	const { data: orgSettings } = useOrgSettings();
	const [expanded, setExpanded] = useState(false);
	const [isCreatePanelOpen, setIsCreatePanelOpen] = useState(false);
	const { user } = useAuthStore();

	const canViewRequests = usePermission("view_requests");
	const canViewQuotes = usePermission("view_quotes");
	const canViewJobs = usePermission("view_jobs");
	const canViewInvoices = usePermission("view_invoices");
	const canViewClients = usePermission("view_clients");
	const canViewInventory = usePermission("view_inventory");
	const canViewVehicles = useAnyPermission(["view_vehicles", "manage_vehicles"]);
	const canViewTechnicians = usePermission("view_technicians");
	const canViewReports = usePermission("view_reports");
	const canViewAdmin = useAnyPermission([
		"view_admin",
		"manage_organization",
		"manage_roles",
	]);

	useSocketQuerySync();

	useEffect(() => {
		const handler = (event: VehicleRestockShortfallEvent) => {
			toast.warning(
				<>
					<div className="text-sm font-semibold text-text-primary">
						Restock shortfall — {event.vehicle_name}
					</div>
					<div className="text-xs text-text-muted mt-0.5">
						{event.date}
					</div>
					<ul className="mt-1 space-y-0.5">
						{event.shortfalls.map((s, i) => (
							<li
								key={i}
								className="text-xs text-warning-text"
							>
								{s.name}: -{s.qty_shortfall}
							</li>
						))}
					</ul>
				</>,
				{ durationMs: 12000 }
			);
		};
		socket.on("vehicle:restock_shortfall", handler);
		return () => {
			socket.off("vehicle:restock_shortfall", handler);
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);
	const handleBack = () => {
		const path = location.pathname;
		const historyIdx = (window.history.state as { idx?: number } | null)?.idx ?? 0;

		if (historyIdx > 0) {
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

	const ICON_SIZE = 20;

	return (
		<div className="flex h-screen bg-canvas text-text-primary">
			{/* SIDEBAR — fixed w-16 in flex layout, inner div overlays on hover (no sibling reflow) */}
			<aside
				onMouseEnter={() => {
					if (!isCreatePanelOpen) setExpanded(true);
				}}
				onMouseLeave={() => setExpanded(false)}
				className="relative w-16 flex-shrink-0 z-40"
			>
				<div
					className={`absolute inset-y-0 left-0 flex flex-col bg-base border-r border-border overflow-hidden transition-[width] duration-200 ease-in-out ${expanded ? "w-40 lg:w-44" : "w-16"}`}
				>
					<nav className="flex-1 py-2 space-y-1 overflow-y-auto overflow-x-hidden sidebar-nav">
						<button
							onClick={() => {
								setIsCreatePanelOpen((o) => !o);
								setExpanded(false);
							}}
							className={`group relative flex items-center h-10 rounded-md mx-2 transition-colors duration-200 w-[calc(100%-16px)] hover:cursor-pointer ${
								isCreatePanelOpen
									? "bg-primary-bg text-primary-text"
									: "text-text-tertiary hover:text-text-primary hover:bg-surface-raised"
							}`}
						>
							<div className="w-12 flex items-center justify-center flex-shrink-0">
								<Plus size={ICON_SIZE} />
							</div>
							<div
								className={`absolute left-12 w-24 flex items-center h-full overflow-hidden transition-[opacity,transform] duration-200 ease-in-out ${
									expanded
										? "opacity-100 translate-x-0"
										: "opacity-0 -translate-x-2 pointer-events-none"
								}`}
							>
								<span className="text-sm whitespace-nowrap truncate pr-2">
									Create
								</span>
							</div>
						</button>
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
						{canViewRequests && (
							<SideNavItem
								expanded={expanded}
								to="/dispatch/requests"
								icon={<Phone size={ICON_SIZE} />}
								label="Requests"
							/>
						)}
						{canViewQuotes && (
							<SideNavItem
								expanded={expanded}
								to="/dispatch/quotes"
								icon={<FileText size={ICON_SIZE} />}
								label="Quotes"
							/>
						)}
						{canViewJobs && (
							<SideNavItem
								expanded={expanded}
								to="/dispatch/jobs"
								icon={
									<Briefcase
										size={ICON_SIZE}
									/>
								}
								label="Jobs"
							/>
						)}
						{canViewInvoices && (
							<SideNavItem
								expanded={expanded}
								to="/dispatch/invoices"
								icon={
									<ReceiptText
										size={ICON_SIZE}
									/>
								}
								label="Invoices"
							/>
						)}
						{canViewClients && (
							<SideNavItem
								expanded={expanded}
								to="/dispatch/clients"
								icon={<Users size={ICON_SIZE} />}
								label="Clients"
							/>
						)}
						{canViewInventory && (
							<SideNavItem
								expanded={expanded}
								to="/dispatch/inventory"
								icon={<Package size={ICON_SIZE} />}
								label="Inventory"
							/>
						)}
						{canViewVehicles && (
							<SideNavItem
								expanded={expanded}
								to="/dispatch/vehicles"
								icon={<Truck size={ICON_SIZE} />}
								label="Vehicles"
							/>
						)}
						{canViewTechnicians && (
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
						{canViewReports && (
							<SideNavItem
								expanded={expanded}
								to="/dispatch/kpi"
								icon={
									<ChartColumnDecreasing
										size={ICON_SIZE}
									/>
								}
								label="KPIs"
							/>
						)}
						{canViewReports && (
							<SideNavItem
								expanded={expanded}
								to="/dispatch/reporting"
								icon={<FileText size={ICON_SIZE} />}
								label="Reporting"
							/>
						)}
						<SideNavItem
							expanded={expanded}
							to="/dispatch/profile"
							icon={<UserRoundCog size={ICON_SIZE} />}
							label="My Profile"
						/>
						{(user?.role === "admin" || canViewAdmin) && (
							<SideNavItem
								expanded={expanded}
								to="/dispatch/admin"
								icon={
									<ShieldUser
										size={ICON_SIZE}
									/>
								}
								label="Admin"
							/>
						)}
					</nav>
				</div>
			</aside>

			<div className="flex flex-col flex-1 overflow-hidden">
				{/* TOP NAV */}
				<header
					className="flex justify-between items-center px-6 h-14 bg-base border-b border-border"
					style={{
						paddingLeft: expanded ? 120 : 24,
						transition: "padding-left 200ms ease-in-out",
					}}
				>
					<div className="flex items-center gap-6">
						<div className="font-semibold text-sm whitespace-nowrap text-text-primary">
							{orgSettings?.name ?? "Dispatch"}
						</div>
						<button
							onClick={handleBack}
							className="flex items-center gap-2 text-text-tertiary hover:text-text-primary px-3 py-2 rounded-lg hover:bg-surface-raised group"
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
						<DispatcherUserMenu />
					</div>
				</header>

				<main className="flex-1 overflow-hidden bg-canvas">
					<div className="p-4 md:p-6 h-full overflow-y-auto">
						<Outlet />
					</div>
				</main>
			</div>
			<CreatePanel
				isOpen={isCreatePanelOpen}
				onClose={() => setIsCreatePanelOpen(false)}
			/>

			<ToastViewport />
		</div>
	);
}
