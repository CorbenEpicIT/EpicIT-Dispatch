import type { Coordinates } from "../types/location.js";
import type { MapboxLineString } from "../services/mapboxService.js";

type Segment = {
	from: [number, number]; // [lon, lat]
	to: [number, number];
	cumStart: number; // cumulative distance at segment start
	length: number;
};

/**
 * Haversine distance in metres between two [lon, lat] points.
 */
function haversine(
	a: [number, number],
	b: [number, number],
): number {
	const R = 6371000;
	const toRad = (d: number) => (d * Math.PI) / 180;
	const lat1 = toRad(a[1]);
	const lat2 = toRad(b[1]);
	const dLat = lat2 - lat1;
	const dLon = toRad(b[0] - a[0]);
	const s =
		Math.sin(dLat / 2) ** 2 +
		Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
	return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}

export type RouteInterpolator = {
	totalSec: number;
	totalMeters: number;
	at: (elapsedSec: number) => Coordinates;
};

/**
 * Build an interpolator that spreads travel along `line` over `totalSec`
 * seconds, proportional to segment length. Returns `{lat, lon}` at any
 * elapsed time.
 */
export function buildInterpolator(
	line: MapboxLineString,
	totalSec: number,
): RouteInterpolator {
	const pts = line.coordinates;
	if (pts.length < 2) {
		const only = pts[0] ?? [0, 0];
		return {
			totalSec,
			totalMeters: 0,
			at: () => ({ lon: only[0], lat: only[1] }),
		};
	}

	const segments: Segment[] = [];
	let cum = 0;
	for (let i = 0; i < pts.length - 1; i++) {
		const from = pts[i];
		const to = pts[i + 1];
		const length = haversine(from, to);
		segments.push({ from, to, cumStart: cum, length });
		cum += length;
	}
	const totalMeters = cum;
	const safeTotal = Math.max(totalSec, 0.001);

	const at = (elapsedSec: number): Coordinates => {
		if (elapsedSec <= 0) {
			const [lon, lat] = pts[0];
			return { lat, lon };
		}
		if (elapsedSec >= safeTotal || totalMeters === 0) {
			const [lon, lat] = pts[pts.length - 1];
			return { lat, lon };
		}

		const targetDist = (elapsedSec / safeTotal) * totalMeters;

		// Binary search would be nicer, but segments are typically small.
		let seg = segments[segments.length - 1];
		for (const s of segments) {
			if (targetDist < s.cumStart + s.length) {
				seg = s;
				break;
			}
		}
		const within = seg.length === 0 ? 0 : (targetDist - seg.cumStart) / seg.length;
		const lon = seg.from[0] + (seg.to[0] - seg.from[0]) * within;
		const lat = seg.from[1] + (seg.to[1] - seg.from[1]) * within;
		return { lat, lon };
	};

	return { totalSec: safeTotal, totalMeters, at };
}
