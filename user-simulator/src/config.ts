import "dotenv/config";

function required(name: string): string {
	const v = process.env[name];
	if (!v) throw new Error(`Missing required env var: ${name}`);
	return v;
}

function num(name: string, fallback: number): number {
	const v = process.env[name];
	if (!v) return fallback;
	const n = Number(v);
	if (!Number.isFinite(n)) throw new Error(`Invalid number for ${name}: ${v}`);
	return n;
}

function parseCoords(raw: string): { lat: number; lon: number } {
	const [latStr, lonStr] = raw.split(",").map((s) => s.trim());
	const lat = Number(latStr);
	const lon = Number(lonStr);
	if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
		throw new Error(`Invalid SIM_HOME_COORDS: ${raw}`);
	}
	return { lat, lon };
}

export const config = {
	backendUrl: required("BACKEND_URL"),
	mapboxToken: required("MAPBOX_TOKEN"),

	adminEmail: required("ADMIN_EMAIL"),
	adminPassword: process.env.ADMIN_PASSWORD ?? "",
	adminOtp: process.env.ADMIN_OTP ?? "000000",
	adminRole: process.env.ADMIN_ROLE ?? "dispatch",

	simServerPort: num("SIM_SERVER_PORT", 5174),

	homeCoords: parseCoords(process.env.SIM_HOME_COORDS ?? "43.9604,-91.25478"),
	tickIntervalMs: num("TICK_INTERVAL_MS", 1000),
	travelDurationSec: num("TRAVEL_DURATION_SEC", 45),
	dwellOnsiteSec: num("DWELL_ONSITE_SEC", 5),
	workDurationSec: num("WORK_DURATION_SEC", 15),
	idlePollTicks: num("IDLE_POLL_TICKS", 10),
};
