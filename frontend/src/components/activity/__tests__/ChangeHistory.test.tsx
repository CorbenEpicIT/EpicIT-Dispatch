import { render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import type { ActivityLog } from "../../../types/logs";
import { useAuthStore } from "../../../auth/authStore";

const { historyState, getClientById, getJobById, getProjectById, getDispatcherById, getOrgRoleById } =
	vi.hoisted(() => ({
		historyState: { data: [] as ActivityLog[], hasMore: false, total: 0 },
		getClientById: vi.fn(async (id: string) => ({ id, name: `Client ${id}` })),
		getJobById: vi.fn(async (id: string) => ({ id, name: `Job ${id}` })),
		getProjectById: vi.fn(async (id: string) => ({ id, name: `Project ${id}` })),
		getDispatcherById: vi.fn(async (id: string) => ({ id, name: `Disp ${id}` })),
		getOrgRoleById: vi.fn(async (id: string) => ({ id, name: `Role ${id}` })),
	}));

vi.mock("../../../hooks/useChangeHistory", () => ({
	CHANGE_HISTORY_PAGE_SIZE: 20,
	CHANGE_HISTORY_REFETCH_MS: 60000,
	useChangeHistory: () => ({
		data: historyState,
		isLoading: false,
		isFetching: false,
		refetch: vi.fn(),
	}),
}));
vi.mock("../../../api/clients", () => ({ getClientById }));
vi.mock("../../../api/jobs", () => ({ getJobById }));
vi.mock("../../../api/project", () => ({ getProjectById }));
vi.mock("../../../api/dispatchers", () => ({ getDispatcherById }));
vi.mock("../../../api/organizations", () => ({ getOrgRoleById }));

import ChangeHistory from "../ChangeHistory";

const mkLog = (i: number, o: Partial<ActivityLog> = {}): ActivityLog => ({
	id: `log-${i}`,
	event_type: "job.updated",
	action: "updated",
	entity_type: "job",
	entity_id: "job-x",
	actor_type: "dispatcher",
	actor_id: "d1",
	actor_name: "Alex",
	changes: { name: { old: `a${i}`, new: `b${i}` } },
	timestamp: new Date(Date.now() - i * 60000).toISOString(),
	ip_address: null,
	user_agent: null,
	reason: null,
	organization_id: "org",
	...o,
});

const loginWith = (permissions: string[]) =>
	useAuthStore.getState().login("dispatcher", "Alex", "d1", "org", "America/Chicago", permissions);

function renderWith(qc?: QueryClient) {
	const client =
		qc ?? new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
	return render(
		<QueryClientProvider client={client}>
			<MemoryRouter>
				<ChangeHistory scope={{ kind: "actor", type: "dispatcher", id: "d1" }} />
			</MemoryRouter>
		</QueryClientProvider>,
	);
}

beforeEach(() => {
	vi.clearAllMocks();
	historyState.data = [];
	historyState.hasMore = false;
	historyState.total = 0;
	loginWith(["view_clients", "view_jobs", "view_projects", "view_dispatchers"]);
});

describe("ChangeHistory — L1 sensitive keys", () => {
	it("never renders password values from a dispatcher.password.changed row", () => {
		historyState.data = [
			mkLog(0, {
				event_type: "dispatcher.password.changed",
				action: "changed",
				entity_type: "dispatcher",
				changes: {
					password: { old: "$2a$10$OLDHASHOLDHASHOLDHASH", new: "$2a$10$NEWHASHNEWHASHNEWHASH" },
					reset_token: { old: null, new: "tok_123456" },
				},
			}),
		];
		historyState.total = 1;
		const { container } = renderWith();
		expect(container.textContent).not.toContain("$2a$10$");
		expect(container.textContent).not.toContain("tok_123456");
		expect(container.textContent).not.toMatch(/Password/);
		expect(container.textContent).not.toMatch(/Reset token/);
		// The event itself is still visible, just without its payload.
		expect(container.textContent).toContain("Dispatcher changed by Alex");
	});
});
