import { config } from "../config.js";
import * as api from "../services/backendApi.js";
import { getDirections } from "../services/mapboxService.js";
import { buildInterpolator, type RouteInterpolator } from "../lib/routeInterpolator.js";
import type { Coordinates } from "../types/location.js";
import type { JobVisit } from "../types/jobs.js";

export type TechState = "Idle" | "Driving" | "OnSite" | "Working";

export type TechSnapshot = {
	techId: string;
	name: string;
	state: TechState;
	currentVisitId: string | null;
	coords: Coordinates;
	isActive: boolean;
};

function visitStart(v: JobVisit): Date {
	return new Date(v.scheduled_start_at);
}

export class TechnicianOperator {
	public readonly techId: string;
	public readonly name: string;
	public isActive = false;

	public coords: Coordinates;
	public state: TechState = "Idle";

	public currentVisit: JobVisit | null = null;
	private interpolator: RouteInterpolator | null = null;
	private phaseStartedAt = 0; // ms epoch when current phase began
	private idlePollCounter = 0;
	private tickBusy = false;

	constructor(args: { techId: string; name: string; coords: Coordinates }) {
		this.techId = args.techId;
		this.name = args.name;
		this.coords = args.coords;
	}

	snapshot(): TechSnapshot {
		return {
			techId: this.techId,
			name: this.name,
			state: this.state,
			currentVisitId: this.currentVisit?.id ?? null,
			coords: this.coords,
			isActive: this.isActive,
		};
	}

	/** Reset all in-memory sim state for this tech. Caller handles backend reset. */
	resetToIdle(coords: Coordinates) {
		this.state = "Idle";
		this.currentVisit = null;
		this.interpolator = null;
		this.phaseStartedAt = 0;
		this.idlePollCounter = 0;
		this.coords = coords;
	}

	async tick(): Promise<void> {
		if (!this.isActive || this.tickBusy) return;
		this.tickBusy = true;
		try {
			switch (this.state) {
				case "Idle":
					await this.tickIdle();
					break;
				case "Driving":
					await this.tickDriving();
					break;
				case "OnSite":
					await this.tickOnSite();
					break;
				case "Working":
					await this.tickWorking();
					break;
			}
		} catch (e) {
			console.error(
				`[tech ${this.name}] tick error in state ${this.state}:`,
				(e as Error).message,
			);
		} finally {
			this.tickBusy = false;
		}
	}

	private async tickIdle(): Promise<void> {
		// Throttle polling for new work.
		if (this.idlePollCounter > 0) {
			this.idlePollCounter--;
			return;
		}
		this.idlePollCounter = config.idlePollTicks;

		const visits = await api.getTechnicianVisits(this.techId);
		const scheduled = visits
			.filter((v) => v.status === "Scheduled")
			.sort(
				(a, b) => visitStart(a).getTime() - visitStart(b).getTime(),
			);
		const next = scheduled[0];
		if (!next) return;

		const destCoords = this.visitCoords(next);
		if (!destCoords) {
			console.warn(
				`[tech ${this.name}] visit ${next.id} has no coords; skipping`,
			);
			return;
		}

		const route = await getDirections(this.coords, destCoords);
		if (!route) {
			console.warn(
				`[tech ${this.name}] mapbox route failed; cannot start visit ${next.id}`,
			);
			return;
		}

		this.interpolator = buildInterpolator(
			route.geometry,
			config.travelDurationSec,
		);

		await api.updateJobVisit(next.id, {
			status: "Driving",
			actual_start_at: new Date().toISOString(),
		});

		this.currentVisit = next;
		this.state = "Driving";
		this.phaseStartedAt = Date.now();
		console.log(
			`[tech ${this.name}] Idle → Driving (visit ${next.id})`,
		);
	}

	private async tickDriving(): Promise<void> {
		if (!this.currentVisit || !this.interpolator) {
			this.state = "Idle";
			return;
		}

		const elapsedSec = (Date.now() - this.phaseStartedAt) / 1000;
		const pos = this.interpolator.at(elapsedSec);
		this.coords = pos;
		await api.pingTechnician(this.techId, pos);

		if (elapsedSec >= config.travelDurationSec) {
			await api.updateJobVisit(this.currentVisit.id, { status: "OnSite" });
			this.state = "OnSite";
			this.phaseStartedAt = Date.now();
			this.interpolator = null;
			console.log(
				`[tech ${this.name}] Driving → OnSite (visit ${this.currentVisit.id})`,
			);
		}
	}

	private async tickOnSite(): Promise<void> {
		if (!this.currentVisit) {
			this.state = "Idle";
			return;
		}
		const elapsedSec = (Date.now() - this.phaseStartedAt) / 1000;
		if (elapsedSec >= config.dwellOnsiteSec) {
			await api.updateJobVisit(this.currentVisit.id, {
				status: "InProgress",
			});
			this.state = "Working";
			this.phaseStartedAt = Date.now();
			console.log(
				`[tech ${this.name}] OnSite → Working (visit ${this.currentVisit.id})`,
			);
		}
	}

	private async tickWorking(): Promise<void> {
		if (!this.currentVisit) {
			this.state = "Idle";
			return;
		}
		const elapsedSec = (Date.now() - this.phaseStartedAt) / 1000;
		if (elapsedSec >= config.workDurationSec) {
			await api.updateJobVisit(this.currentVisit.id, {
				status: "Completed",
				actual_end_at: new Date().toISOString(),
			});
			console.log(
				`[tech ${this.name}] Working → Completed (visit ${this.currentVisit.id})`,
			);
			this.currentVisit = null;
			this.state = "Idle";
			this.idlePollCounter = 0; // check for next visit immediately
		}
	}

	private visitCoords(v: JobVisit): Coordinates | null {
		const c = v.job?.coords;
		if (!c) return null;
		if (typeof c.lat !== "number" || typeof c.lon !== "number") return null;
		return { lat: c.lat, lon: c.lon };
	}
}
