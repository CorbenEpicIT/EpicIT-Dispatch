import type { Feature, LineString } from "geojson";
import type { Coordinates, DirectionsResult } from "../types/location";

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN;

interface MapboxRoute {
	geometry: LineString;
	duration: number;
	distance: number;
}

interface MapboxDirectionsResponse {
	routes: MapboxRoute[];
	code: string;
	message?: string;
}

export async function fetchDrivingRoute(
	from: Coordinates,
	to: Coordinates,
): Promise<DirectionsResult | null> {
	if (!MAPBOX_TOKEN) {
		console.error("Missing VITE_MAPBOX_TOKEN; cannot fetch directions.");
		return null;
	}

	const coords = `${from.lon},${from.lat};${to.lon},${to.lat}`;
	const url =
		`https://api.mapbox.com/directions/v5/mapbox/driving-traffic/${coords}` +
		`?geometries=geojson&overview=full&access_token=${MAPBOX_TOKEN}`;

	const response = await fetch(url);
	if (!response.ok) {
		throw new Error(`Directions request failed: ${response.status}`);
	}

	const body: MapboxDirectionsResponse = await response.json();
	if (body.code !== "Ok" || body.routes.length === 0) return null;

	const route = body.routes[0];
	const geometry: Feature<LineString> = {
		type: "Feature",
		properties: {},
		geometry: route.geometry,
	};

	return {
		geometry,
		durationSeconds: route.duration,
		distanceMeters: route.distance,
	};
}
