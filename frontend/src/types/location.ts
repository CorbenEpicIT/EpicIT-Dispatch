export interface GeocodeResult {
	address: string;
	coords: Coordinates;
}

export interface StaticMarker {
	coords: Coordinates;
	type: MarkerTypeValue;
	label?: string;
	onClick?: () => void;
}

export type Coordinates = { lat: number; lon: number };

export const MarkerType = ["CLIENT", "SITE", "WAREHOUSE", "RESOURCE", "TECHNICIAN"] as const;
export type MarkerTypeValue = (typeof MarkerType)[number];
