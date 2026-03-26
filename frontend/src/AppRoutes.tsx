import LoginPage from "./auth/LoginPage";
import DispatchLayout from "./layouts/DispatchLayout";
import TechnicianLayout from "./layouts/TechnicianLayout";
import TechnicianDashboardPage from "./pages/technician/TechnicianDashboardPage";
import TechnicianVisitsPage from "./pages/technician/TechnicianVisitsPage";
import TechnicianVisitDetailPage from "./pages/technician/TechnicianVisitDetailPage";
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
import SettingsPage from "./pages/dispatch/SettingsPage";
import QuotesPage from "./pages/dispatch/QuotesPage";
import QuoteDetailPage from "./pages/dispatch/QuoteDetailPage";
import AssignTechnicianPage from "./pages/dispatch/AssignTechnicianPage";
import RequestsPage from "./pages/dispatch/RequestsPage";
import RequestDetailsPage from "./pages/dispatch/RequestDetailPage";
import InventoryPage from "./pages/dispatch/InventoryPage";
import FullMapPage from "./pages/dispatch/FullMapPage";
import InvoicesPage from "./pages/dispatch/InvoicesPage";
import InvoiceDetailPage from "./pages/dispatch/InvoiceDetailPage";

import { Routes, Route, Navigate } from "react-router-dom";
import { useAuthStore } from "./auth/authStore";
import type { JSX } from "react";

function RequireAuth({ children }: { children: JSX.Element }) {
	const { user } = useAuthStore();
	return user ? children : <Navigate to="/login" replace />;
}

export default function AppRoutes() {
	return (
		<Routes>
			<Route path="/login" element={<LoginPage />} />

			<Route
				path="/dispatch/*"
				element={
					<RequireAuth>
						<DispatchLayout />
					</RequireAuth>
				}
			>
				<Route index element={<DashboardPage />} />
				<Route path="schedule" element={<SchedulePage />} />
				<Route path="clients" element={<ClientsPage />} />
				<Route path="clients/:clientId" element={<ClientDetailsPage />} />
				<Route path="jobs" element={<JobsPage />} />
				<Route path="jobs/:jobId" element={<JobDetailPage />} />
				<Route
					path="jobs/:jobId/visits/:visitId"
					element={<JobVisitDetailPage />}
				/>

				<Route
					path="recurring-plans/:recurringPlanId"
					element={<RecurringPlanDetailPage />}
				/>
				<Route path="technicians" element={<TechniciansPage />} />
				<Route
					path="technicians/:technicianId"
					element={<TechnicianDetailsPage />}
				/>
				<Route
					path="technicians/:technicianId/assign"
					element={<AssignTechnicianPage />}
				/>
				<Route path="map" element={<MapPage />} />
				<Route path="reporting" element={<ReportingPage />} />
				<Route path="settings" element={<SettingsPage />} />
				<Route path="inventory" element={<InventoryPage />} />
				<Route path="quotes" element={<QuotesPage />} />
				<Route path="quotes/:quoteId" element={<QuoteDetailPage />} />
				<Route path="requests" element={<RequestsPage />} />
				<Route
					path="requests/:requestId"
					element={<RequestDetailsPage />}
				/>
				<Route path="invoices" element={<InvoicesPage />} />
				<Route path="invoices/:invoiceId" element={<InvoiceDetailPage />} />
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
				<Route path="visits" element={<TechnicianVisitsPage />} />
				<Route path="visits/:visitId" element={<TechnicianVisitDetailPage />} />
			</Route>

			<Route path="*" element={<Navigate to="/login" replace />} />
		</Routes>
	);
}
