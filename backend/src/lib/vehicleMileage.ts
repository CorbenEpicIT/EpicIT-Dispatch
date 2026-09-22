import { getScopedDb } from "./context.js";

interface MapboxDirectionsResponse {
	routes: Array<{ distance: number }>;
	code: string;
	message?: string;
}

export async function fetchRouteDistanceMiles(
	techCoords: { lat: number; lon: number } | null | undefined,
	jobCoords: { lat: number; lon: number } | null | undefined,
): Promise<number | null> {
	const token = process.env.MAPBOX_TOKEN;
	if (!token || !techCoords?.lat || !techCoords?.lon || !jobCoords?.lat || !jobCoords?.lon) {
		if (!token) console.error("Missing MAPBOX_TOKEN; cannot fetch route distance.");
		return null;
	}
	const coords = `${techCoords.lon},${techCoords.lat};${jobCoords.lon},${jobCoords.lat}`;
	const url =
		`https://api.mapbox.com/directions/v5/mapbox/driving/${coords}` +
		`?overview=false&access_token=${token}`;
	const controller = new AbortController();
	const timeoutId = setTimeout(() => controller.abort(), 8_000);
	try {
		const resp = await fetch(url, { signal: controller.signal });
		if (!resp.ok) return null;
		const data = (await resp.json()) as MapboxDirectionsResponse;
		if (data.code !== "Ok" || !data.routes.length) return null;
		return data.routes[0].distance / 1609.34;
	} catch { return null; }
	finally { clearTimeout(timeoutId); }
}

export async function applyOdometerIncrement(sdb: ReturnType<typeof getScopedDb>, techId: string, miles: number) {
    const tech = await sdb.technician.findFirst({
        where: { id: techId },
        select: { current_vehicle_id: true },
    });
    if (tech?.current_vehicle_id) {
        await sdb.vehicle.update({
            where: { id: tech.current_vehicle_id },
            data: {
                current_odometer_mi: { increment: Math.round(miles) },
                odometer_updated_at: new Date(),
            },
        });
    }
}
