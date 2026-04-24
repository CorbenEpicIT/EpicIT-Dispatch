import { useEffect, useRef } from "react";
import mapboxgl from "mapbox-gl";
import type { StaticMarker } from "../../../types/location";
import "mapbox-gl/dist/mapbox-gl.css";
import CreateMarker from "./MarkerFactory";

interface DynamicMapProps {
	containerRef: React.RefObject<HTMLDivElement | null>;
	staticMarkers?: StaticMarker[];
}

const DynamicMap = ({ containerRef, staticMarkers = [] }: DynamicMapProps) => {
	const mapRef = useRef<mapboxgl.Map | null>(null);
	const markersRef = useRef<Map<string, mapboxgl.Marker>>(new Map());
	const hasFitRef = useRef(false);

	useEffect(() => {
		if (mapRef.current) return;
		mapboxgl.accessToken = import.meta.env.VITE_MAPBOX_TOKEN;

		mapRef.current = new mapboxgl.Map({
			container: containerRef.current!,
			center: [-91.22, 43.85],
			zoom: 10,
			style: "mapbox://styles/mapbox/standard",
			minZoom: 5,
			maxZoom: 22,
			config: {
				basemap: {
					lightPreset: "dusk",
					showPointOfInterestLabels: false,
				},
			},
		});
	}, [containerRef]);

	// Resize map once after the container stops changing
	useEffect(() => {
		const el = containerRef.current;
		if (!el) return;
		let timer: ReturnType<typeof setTimeout>;
		const ro = new ResizeObserver(() => {
			clearTimeout(timer);
			timer = setTimeout(() => mapRef.current?.resize(), 250);
		});
		ro.observe(el);
		return () => {
			ro.disconnect();
			clearTimeout(timer);
		};
	}, [containerRef]);

	useEffect(() => {
		const map = mapRef.current;
		if (!map) return;

		const currentMarkerIds = new Set();

		staticMarkers.forEach((m) => {
			const markerId = `${m.type}-${m.label}`;
			currentMarkerIds.add(markerId);

			const existingMarker = markersRef.current.get(markerId);

			if (existingMarker) {
				existingMarker.setLngLat(m.coords);
			} else {
				const newMarker = new mapboxgl.Marker({
					element: CreateMarker(m),
					anchor: "bottom",
				})
					.setLngLat(m.coords)
					.addTo(map);

				markersRef.current.set(markerId, newMarker);
			}
		});

		markersRef.current.forEach((marker, id) => {
			if (!currentMarkerIds.has(id)) {
				marker.remove();
				markersRef.current.delete(id);
			}
		});
		// Autofit based on the markers instead of fixed, if there are markers
		if (staticMarkers.length > 0 && !hasFitRef.current) {
			hasFitRef.current = true;
			const bounds = new mapboxgl.LngLatBounds();
			staticMarkers.forEach((m) => bounds.extend(m.coords));

			const fitBounds = () => map.fitBounds(bounds, { padding: 60, maxZoom: 15 });

			if (map.isStyleLoaded()) {
				fitBounds();
			} else {
				map.once("style.load", fitBounds);
			}
		}
	}, [staticMarkers]);

	return null;
};

export default DynamicMap;
