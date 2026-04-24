import type { Coordinates } from "../types/location";

// Paul Tol "light" qualitative palette — colorblind-safe and readable on dark UI.
// Reference: https://personal.sron.nl/~pault/
export const TECH_COLOR_PALETTE: readonly string[] = [
	"#77AADD",
	"#EE8866",
	"#EEDD88",
	"#FFAABB",
	"#99DDFF",
	"#44BB99",
	"#BBCC33",
	"#AAAA00",
	"#DDDDDD",
] as const;

export function getTechColor(techId: string, orderedIds: string[]): string {
	const index = orderedIds.indexOf(techId);
	if (index < 0) return TECH_COLOR_PALETTE[0];
	return TECH_COLOR_PALETTE[index % TECH_COLOR_PALETTE.length];
}

export function coordsEqual(a: Coordinates, b: Coordinates): boolean {
	return a.lat === b.lat && a.lon === b.lon;
}

// Haversine distance in meters between two coordinates.
export function distanceMeters(a: Coordinates, b: Coordinates): number {
	const R = 6371000;
	const toRad = (deg: number) => (deg * Math.PI) / 180;
	const dLat = toRad(b.lat - a.lat);
	const dLon = toRad(b.lon - a.lon);
	const lat1 = toRad(a.lat);
	const lat2 = toRad(b.lat);
	const h =
		Math.sin(dLat / 2) * Math.sin(dLat / 2) +
		Math.sin(dLon / 2) * Math.sin(dLon / 2) * Math.cos(lat1) * Math.cos(lat2);
	return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}
