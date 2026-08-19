import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import JobsPage from "../JobsPage";
import { useAuthStore } from "../../../auth/authStore";
import type { Job } from "../../../types/jobs";
import type { RecurringPlan } from "../../../types/recurringPlans";

const { state } = vi.hoisted(() => ({
	state: { jobs: [] as unknown[], plans: [] as unknown[] },
}));

vi.mock("../../../hooks/useJobs", () => ({
	useAllJobsQuery: () => ({ data: state.jobs, isLoading: false, error: null }),
	useCreateJobMutation: () => ({ mutateAsync: vi.fn() }),
}));
vi.mock("../../../hooks/useRecurringPlans", () => ({
	useAllRecurringPlansQuery: () => ({ data: state.plans, isLoading: false, error: null }),
}));
vi.mock("../../../hooks/useClients", () => ({
	useClientByIdQuery: () => ({ data: undefined }),
}));
vi.mock("../../../components/jobs/CreateJob", () => ({ default: () => null }));
vi.mock("../../../components/recurringPlans/CreateRecurringPlan", () => ({ default: () => null }));
vi.mock("../../../components/reports/PageReportSection", () => ({ default: () => null }));

const job = {
	id: "job-1",
	job_number: "J-1001",
	name: "Furnace tune-up",
	address: "12 Job Street",
	status: "Scheduled",
	priority: "High",
	client: { name: "Acme" },
	client_id: "c1",
	visits: [],
	estimated_total: 100,
} as unknown as Job;

const plan = {
	id: "plan-1",
	client_id: "c1",
	name: "Quarterly filter swap",
	description: "",
	address: "742 Evergreen Terrace",
	priority: "Medium",
	status: "Active",
	starts_at: "2026-01-01",
	timezone: "America/Chicago",
	generation_window_days: 30,
	min_advance_days: 1,
	billing_mode: "per_visit",
	invoice_timing: "on_completion",
	auto_invoice: false,
	created_at: "2026-01-01",
	updated_at: "2026-01-01",
	client: { name: "Acme" },
	occurrences: [],
	line_items: [],
} as unknown as RecurringPlan;

const renderAt = (url: string) =>
	render(
		<MemoryRouter initialEntries={[url]}>
			<Routes>
				<Route path="/dispatch/jobs" element={<JobsPage />} />
			</Routes>
		</MemoryRouter>,
	);

beforeEach(() => {
	state.jobs = [job];
	state.plans = [plan];
	useAuthStore
		.getState()
		.login("dispatcher", "Alex", "d1", "org", "America/Chicago", [
			"view_jobs",
			"create_jobs",
			"manage_recurring_plans",
		]);
});

describe("JobsPage columns (U7 / 05-F2)", () => {
	it("Jobs view hides the Property column (address is rendered inside the job cell)", async () => {
		renderAt("/dispatch/jobs");
		expect(await screen.findByText("Furnace tune-up")).toBeInTheDocument();
		expect(screen.queryByRole("columnheader", { name: "Property" })).toBeNull();
		expect(screen.getByText("12 Job Street")).toBeInTheDocument();
	});

	it("Templates view shows the Property column so the plan address is visible", async () => {
		renderAt("/dispatch/jobs?view=templates");
		expect(await screen.findByText("Quarterly filter swap")).toBeInTheDocument();
		expect(screen.getByRole("columnheader", { name: "Property" })).toBeInTheDocument();
		expect(screen.getByText("742 Evergreen Terrace")).toBeInTheDocument();
	});
});
