import LoginPage from "./auth/LoginPage";
import DispatchLayout from "./layouts/DispatchLayout";
import DispatcherDetailPage from "./pages/dispatch/DispatcherDetailPage";
import TechnicianLayout from "./layouts/TechnicianLayout";
import TechnicianDashboardPage from "./pages/technician/TechnicianDashboardPage";
import TechnicianVisitsPage from "./pages/technician/TechnicianVisitsPage";
import TechnicianVisitDetailPage from "./pages/technician/TechnicianVisitDetailPage";
import TechnicianNotificationsPage from "./pages/technician/TechnicianNotificationsPage";
import TechnicianVehiclePage from "./pages/technician/TechnicianVehiclePage";
import TechnicianMapPage from "./pages/technician/TechnicianMapPage";
import TechnicianMileagePage from "./pages/technician/TechnicianMileagePage";
import DashboardPage from "./pages/dispatch/DashboardPage";
import JobsPage from "./pages/dispatch/JobsPage";
import JobDetailPage from "./pages/dispatch/JobDetailPage";
import JobVisitDetailPage from "./pages/dispatch/JobVisitDetailPage";
import RecurringPlanDetailPage from "./pages/dispatch/RecurringPlanDetailPage";
import SchedulePage from "./pages/dispatch/SchedulePage";
import ClientsPage from "./pages/dispatch/ClientsPage";
import ClientDetailsPage from "./pages/dispatch/ClientDetailPage";
import TechniciansPage from "./pages/dispatch/TechniciansPage";
import TechnicianDetailsPage from "./pages/dispatch/TechnicianDetailPage";
import MapPage from "./pages/dispatch/MapPage";
import ReportingPage from "./pages/dispatch/ReportingPage";
import ReportBuilderPage from "./pages/dispatch/ReportBuilderPage";
import KPIPage from "./pages/dispatch/KPIPage";
import MileageReportPage from "./pages/dispatch/MileageReportPage";
import TimesheetsReportPage from "./pages/dispatch/TimesheetsReportPage";
import ReorderForecastPage from "./pages/dispatch/ReorderForecastPage";
import AgedReceivablesPage from "./pages/dispatch/AgedReceivablesPage";
import ClientRetentionPage from "./pages/dispatch/ClientRetentionPage";
import TaxLiabilityPage from "./pages/dispatch/TaxLiabilityPage";
import PaymentsReportPage from "./pages/dispatch/PaymentsReportPage";
import QuoteFunnelPage from "./pages/dispatch/QuoteFunnelPage";
import FirstTimeFixRatePage from "./pages/dispatch/FirstTimeFixRatePage";
import TechnicianScorecardPage from "./pages/dispatch/TechnicianScorecardPage";
import QuotesPage from "./pages/dispatch/QuotesPage";
import QuoteDetailPage from "./pages/dispatch/QuoteDetailPage";
import AssignTechnicianPage from "./pages/dispatch/AssignTechnicianPage";
import RequestsPage from "./pages/dispatch/RequestsPage";
import RequestDetailsPage from "./pages/dispatch/RequestDetailPage";
import InventoryPage from "./pages/dispatch/InventoryPage";
import LabelPrintPage from "./components/inventory/labels/LabelPrintPage";
import ItemTrackingPage from "./pages/dispatch/ItemTrackingPage";
import SerialDetailPage from "./pages/dispatch/SerialDetailPage";
import BatchDetailPage from "./pages/dispatch/BatchDetailPage";
import FullMapPage from "./pages/dispatch/FullMapPage";
import InvoicesPage from "./pages/dispatch/InvoicesPage";
import InvoiceDetailPage from "./pages/dispatch/InvoiceDetailPage";
import AdminPage from "./pages/dispatch/AdminPage";
import FollowupsPage from "./pages/dispatch/FollowupsPage";
import VehiclesPage from "./pages/dispatch/VehiclesPage";
import VehicleStockPage from "./pages/dispatch/VehicleStockPage";
import VerifyEmailPage from "./pages/dispatch/VerifyEmailPage";
import ResetPasswordPage from "./pages/ResetPasswordPage";
import RegisterPage from "./pages/RegisterPage";
import MyProfilePage from "./pages/MyProfilePage";
import QBCallbackPage from "./pages/QBCallbackPage";
import SSOCompletePage from "./pages/SSOCompletePage";
import ProjectsPage from "./pages/dispatch/ProjectsPage";
import ProjectDetailPage from "./pages/dispatch/ProjectDetailPage";

import { Routes, Route, Navigate, useLocation } from "react-router-dom";
import { useAuthStore, isTokenExpired } from "./auth/authStore";
import { usePermission, useAnyPermission } from "./hooks/usePermission";
import { useEffect, type JSX } from "react";

function RequireAuth({ children }: { children: JSX.Element }) {
	const { user, logout } = useAuthStore();
	const location = useLocation();
	const expired = user ? isTokenExpired() : false;

	useEffect(() => {
		if (expired) logout();
	}, [expired, logout, location.pathname]);

	if (!user || expired) return <Navigate to="/login" replace />;
	return children;
}
// stops technicians from accessing dispatch routes 
function RequireDispatcher({ children }: { children: JSX.Element }) {
	const { user } = useAuthStore();
	if (!user) return <Navigate to="/login" replace />;
	if (user.role === "technician") return <Navigate to="/technician" replace />;
	return children;
}
// stops dispatch users from accessing admin page unless they have view_admin permission
function RequireAdmin({ children }: { children: JSX.Element }) {
	const { user } = useAuthStore();
	const hasViewAdmin = usePermission("view_admin");
	if (!user) return <Navigate to="/login" replace />;
	if (user.role !== "admin" && !hasViewAdmin) return <Navigate to="/dispatch" replace />;
	return children;
}

function RequirePermission({ permission, children }: { permission: string; children: JSX.Element }) {
	const allowed = usePermission(permission);
	return allowed ? children : <Navigate to="/dispatch" replace />;
}

function RequireAnyPermission({ permissions, children }: { permissions: string[]; children: JSX.Element }) {
	const allowed = useAnyPermission(permissions);
	return allowed ? children : <Navigate to="/dispatch" replace />;
}

export default function AppRoutes() {
	// Wait for auth store to hydrate before rendering routes to prevent flicker of protected pages on load
	const hasHydrated = useAuthStore((s) => s._hasHydrated);
	if (!hasHydrated) return null;

	return (
		<Routes>
			<Route path="/login" element={<LoginPage />} />
			<Route path="/register" element={<RegisterPage />} />
			<Route path="/verify-email" element={<VerifyEmailPage />} />
			<Route path="/reset-password" element={<ResetPasswordPage />} />
			<Route path="/quickbooks/callback" element={<QBCallbackPage />} />
			<Route path="/auth/sso/complete" element={<SSOCompletePage />} />
			<Route
				path="/dispatch/*"
				element={
					<RequireDispatcher>
						<DispatchLayout />
					</RequireDispatcher>
				}
			>
				<Route index element={<DashboardPage />} />
				<Route path="schedule" element={<SchedulePage />} />
				<Route path="clients" element={<RequirePermission permission="view_clients"><ClientsPage /></RequirePermission>} />
				<Route path="clients/:clientId" element={<RequirePermission permission="view_clients"><ClientDetailsPage /></RequirePermission>} />
				<Route path="jobs" element={<RequirePermission permission="view_jobs"><JobsPage /></RequirePermission>} />
				<Route path="jobs/:jobId" element={<RequirePermission permission="view_jobs"><JobDetailPage /></RequirePermission>} />
				<Route
					path="jobs/:jobId/visits/:visitId"
					element={<RequireAnyPermission permissions={["view_jobs", "view_visits"]}><JobVisitDetailPage /></RequireAnyPermission>}
				/>
				<Route path="projects" element={<RequirePermission permission="view_projects"><ProjectsPage /></RequirePermission>} />
				<Route path="projects/:projectId" element={<RequirePermission permission="view_projects"><ProjectDetailPage /></RequirePermission>} />
				<Route
					path="recurring-plans/:recurringPlanId"
					element={<RequirePermission permission="view_recurring_plans"><RecurringPlanDetailPage /></RequirePermission>}
				/>
				<Route path="dispatchers/:dispatcherId" element={<RequirePermission permission="view_dispatchers"><DispatcherDetailPage /></RequirePermission>} />
				<Route path="technicians" element={<RequirePermission permission="view_technicians"><TechniciansPage /></RequirePermission>} />
				<Route
					path="technicians/:technicianId"
					element={<RequirePermission permission="view_technicians"><TechnicianDetailsPage /></RequirePermission>}
				/>
				<Route
					path="technicians/:technicianId/assign"
					element={<RequirePermission permission="manage_technicians"><AssignTechnicianPage /></RequirePermission>}
				/>
				<Route path="map" element={<MapPage />} />
				<Route path="reporting" element={<RequirePermission permission="view_reports"><ReportingPage /></RequirePermission>} />
				<Route path="reporting/builder" element={<RequirePermission permission="view_reports"><ReportBuilderPage /></RequirePermission>} />
				<Route path="reporting/aged-receivables" element={<RequirePermission permission="view_reports"><AgedReceivablesPage /></RequirePermission>} />
				<Route path="reporting/client-retention" element={<RequirePermission permission="view_reports"><ClientRetentionPage /></RequirePermission>} />
				<Route path="reporting/tax-liability" element={<RequirePermission permission="view_reports"><TaxLiabilityPage /></RequirePermission>} />
				<Route path="reporting/payments" element={<RequirePermission permission="view_reports"><PaymentsReportPage /></RequirePermission>} />
				<Route path="reporting/quote-funnel" element={<RequirePermission permission="view_reports"><QuoteFunnelPage /></RequirePermission>} />
				<Route path="reporting/first-time-fix" element={<RequirePermission permission="view_reports"><FirstTimeFixRatePage /></RequirePermission>} />
				<Route path="reporting/technician-scorecard" element={<RequirePermission permission="view_reports"><TechnicianScorecardPage /></RequirePermission>} />
				<Route path="kpi" element={<RequirePermission permission="view_reports"><KPIPage /></RequirePermission>} />
				<Route path="mileage" element={<MileageReportPage />} />
				<Route path="timesheets" element={<RequirePermission permission="view_reports"><TimesheetsReportPage /></RequirePermission>} />
				<Route path="inventory/reorder-forecast" element={<RequirePermission permission="view_reports"><ReorderForecastPage /></RequirePermission>} />
				<Route path="inventory" element={<RequirePermission permission="view_inventory"><InventoryPage /></RequirePermission>} />
				<Route path="inventory/labels/print" element={<RequirePermission permission="manage_inventory"><LabelPrintPage /></RequirePermission>} />
				<Route path="inventory/items/:itemId/tracking" element={<RequirePermission permission="view_inventory"><ItemTrackingPage /></RequirePermission>} />
				<Route path="inventory/serials/:serialId" element={<RequirePermission permission="view_inventory"><SerialDetailPage /></RequirePermission>} />
				<Route path="inventory/batches/:batchId" element={<RequirePermission permission="view_inventory"><BatchDetailPage /></RequirePermission>} />
				<Route path="quotes" element={<RequirePermission permission="view_quotes"><QuotesPage /></RequirePermission>} />
				<Route path="quotes/:quoteId" element={<RequirePermission permission="view_quotes"><QuoteDetailPage /></RequirePermission>} />
				<Route path="requests" element={<RequirePermission permission="view_requests"><RequestsPage /></RequirePermission>} />
				<Route
					path="requests/:requestId"
					element={<RequirePermission permission="view_requests"><RequestDetailsPage /></RequirePermission>}
				/>
				<Route path="invoices" element={<RequirePermission permission="view_invoices"><InvoicesPage /></RequirePermission>} />
				<Route path="invoices/:invoiceId" element={<RequirePermission permission="view_invoices"><InvoiceDetailPage /></RequirePermission>} />
				<Route path="profile" element={<RequireAuth><MyProfilePage /></RequireAuth>} />
				<Route path="admin" element={<RequireAnyPermission permissions={["view_admin", "manage_organization", "manage_roles"]}><AdminPage /></RequireAnyPermission>} />
				<Route path="followups" element={<RequirePermission permission="view_followups"><FollowupsPage /></RequirePermission>} />
				<Route path="vehicles" element={<RequireAnyPermission permissions={["view_inventory", "manage_technicians"]}><VehiclesPage /></RequireAnyPermission>} />
				<Route path="vehicles/:id/stock" element={<RequireAnyPermission permissions={["view_inventory", "manage_technicians"]}><VehicleStockPage /></RequireAnyPermission>} />
			</Route>

			<Route
				path="/map"
				element={
					<RequireAuth>
						<FullMapPage />
					</RequireAuth>
				}
			></Route>

			<Route
				path="/technician/*"
				element={
					<RequireAuth>
						<TechnicianLayout />
					</RequireAuth>
				}
			>
				<Route index element={<TechnicianDashboardPage />} />
				<Route path="visits" element={<RequirePermission permission="view_visits"><TechnicianVisitsPage /></RequirePermission>} />
				<Route path="visits/:visitId" element={<RequirePermission permission="view_visits"><TechnicianVisitDetailPage /></RequirePermission>} />
				<Route path="notifications" element={<TechnicianNotificationsPage />} />
				<Route path="vehicles" element={<RequirePermission permission="view_vehicles"><TechnicianVehiclePage /></RequirePermission>} />
				<Route path="map" element={<TechnicianMapPage />} />
				<Route path="profile" element={<MyProfilePage />} />
				<Route path="mileage" element={<TechnicianMileagePage />} />
			</Route>

			<Route path="*" element={<Navigate to="/login" replace />} />
		</Routes>
	);
}
