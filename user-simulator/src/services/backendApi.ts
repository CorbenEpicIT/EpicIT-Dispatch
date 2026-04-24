import type { AxiosRequestConfig } from "axios";
import http from "./httpService.js";
import { config } from "../config.js";
import * as adminAuth from "../auth/adminAuth.js";
import type { Coordinates } from "../types/location.js";
import type { Technician } from "../types/technicians.js";
import type { Client } from "../types/clients.js";
import type { Job, JobVisit, VisitStatus } from "../types/jobs.js";

type Envelope<T> = {
	success: boolean;
	data: T | null;
	error: { code: string; message: string } | null;
};

async function call<T>(
	method: "get" | "post" | "put" | "patch" | "delete",
	path: string,
	body?: unknown,
	config2: AxiosRequestConfig = {},
): Promise<T> {
	const token = await adminAuth.getToken();
	const url = `${config.backendUrl}${path}`;
	const headers = {
		...(config2.headers ?? {}),
		Authorization: `Bearer ${token}`,
	};

	const send = (): Promise<{ status: number; data: Envelope<T> }> => {
		if (method === "get" || method === "delete") {
			return http.request<Envelope<T>>({
				url,
				method,
				headers,
				...config2,
				validateStatus: () => true,
			});
		}
		return http.request<Envelope<T>>({
			url,
			method,
			headers,
			data: body,
			...config2,
			validateStatus: () => true,
		});
	};

	let resp = await send();
	if (resp.status === 401) {
		adminAuth.invalidate();
		const newToken = await adminAuth.getToken();
		headers.Authorization = `Bearer ${newToken}`;
		resp = await send();
	}

	const env = resp.data;
	if (!env || !env.success) {
		const msg = env?.error?.message ?? `HTTP ${resp.status}`;
		throw new Error(`${method.toUpperCase()} ${path} failed: ${msg}`);
	}
	return env.data as T;
}

// ── Technicians ─────────────────────────────────────────────────────────────

export const listTechnicians = () => call<Technician[]>("get", "/technicians");

export const createTechnician = (body: {
	name: string;
	email: string;
	phone: string;
	password: string;
	title: string;
	coords: Coordinates;
	description?: string;
}) => call<Technician>("post", "/technicians", body);

export const pingTechnician = (id: string, coords: Coordinates) =>
	call<Technician>("post", `/technicians/${id}/ping`, { coords });

export const getTechnicianVisits = (techId: string) =>
	call<JobVisit[]>("get", `/technicians/${techId}/visits`);

// ── Clients ─────────────────────────────────────────────────────────────────

export const listClients = () => call<Client[]>("get", "/clients");

export const createClient = (body: {
	name: string;
	address: string;
	coords: Coordinates;
	is_active?: boolean;
}) => call<Client>("post", "/clients", body);

// ── Jobs ────────────────────────────────────────────────────────────────────

export const createJob = (body: {
	name: string;
	client_id: string;
	address: string;
	coords: Coordinates;
	description?: string;
}) => call<Job>("post", "/jobs", body);

// ── Job Visits ──────────────────────────────────────────────────────────────

export const createJobVisit = (body: {
	job_id: string;
	name: string;
	arrival_constraint: "anytime" | "at" | "between" | "by";
	finish_constraint: "when_done" | "at" | "by";
	scheduled_start_at: string;
	scheduled_end_at: string;
	tech_ids?: string[];
}) => call<JobVisit>("post", "/job-visits", body);

export const updateJobVisit = (
	id: string,
	body: {
		status?: VisitStatus;
		actual_start_at?: string | null;
		actual_end_at?: string | null;
	},
) => call<JobVisit>("put", `/job-visits/${id}`, body);

export const assignVisitTechs = (visitId: string, tech_ids: string[]) =>
	call<JobVisit>("put", `/job-visits/${visitId}/technicians`, { tech_ids });

export const listVisitsInRange = (startIso: string, endIso: string) =>
	call<JobVisit[]>(
		"get",
		`/job-visits/date-range/${encodeURIComponent(startIso)}/${encodeURIComponent(endIso)}`,
	);
