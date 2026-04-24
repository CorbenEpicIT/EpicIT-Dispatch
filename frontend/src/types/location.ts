import type { Feature, LineString } from "geojson";

export interface GeocodeResult {
	address: string;
	coords: Coordinates;
}

export interface StaticMarker {
	id: string;
	coords: Coordinates;
	type: MarkerTypeValue;
	label?: string;
	color?: string;
	statusDotColor?: string;
	variant?: "default" | "dimmed";
}

export type Coordinates = { lat: number; lon: number };

export const MarkerType = ["CLIENT", "SITE", "WAREHOUSE", "RESOURCE", "TECHNICIAN"] as const;
export type MarkerTypeValue = (typeof MarkerType)[number];

export interface DirectionsResult {
	geometry: Feature<LineString>;
	durationSeconds: number;
	distanceMeters: number;
}

export interface TechRouteData {
	techId: string;
	techName: string;
	color: string;
	current: Coordinates;
	destination: Coordinates;
	destinationLabel: string;
	routeGeoJSON: Feature<LineString> | null;
	etaSeconds: number | null;
	distanceMeters: number | null;
}
