import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import mapboxgl from "mapbox-gl";
import type { GeoJSONSource } from "mapbox-gl";
import type { StaticMarker, TechRouteData } from "../../../types/location";
import "mapbox-gl/dist/mapbox-gl.css";
import CreateMarker from "./MarkerFactory";
import { Copy, Check, RefreshCw } from "lucide-react";

type BrowserHint = {
	name: string;
	url: string;
	steps: string;
};

function getBrowserHint(): BrowserHint {
	const ua = navigator.userAgent;
	if (ua.includes("Edg/"))
		return {
			name: "Edge",
			url: "edge://flags/#ignore-gpu-blocklist",
			steps: 'Set "Override software rendering list" to Enabled, then click Restart.',
		};
	if (ua.includes("Chrome/"))
		return {
			name: "Chrome",
			url: "chrome://flags/#ignore-gpu-blocklist",
			steps: 'Set "Override software rendering list" to Enabled, then click Relaunch.',
		};
	if (ua.includes("Firefox/"))
		return {
			name: "Firefox",
			url: "about:config",
			steps: "Search for webgl.disabled and set it to false, then reload.",
		};
	if (ua.includes("Safari/"))
		return {
			name: "Safari",
			url: "",
			steps: "Go to Develop → Experimental Features and enable WebGL.",
		};
	return {
		name: "your browser",
		url: "",
		steps: "Enable WebGL or hardware acceleration in your browser settings.",
	};
}

function WebGLErrorFallback({ afterContextLoss }: { afterContextLoss: boolean }) {
	const [copied, setCopied] = useState(false);
	const hint = getBrowserHint();

	function copyUrl() {
		navigator.clipboard.writeText(hint.url).then(() => {
			setCopied(true);
			setTimeout(() => setCopied(false), 2000);
		});
	}

	if (afterContextLoss) {
		return (
			<div className="flex flex-col items-center justify-center h-full gap-4 text-zinc-400 text-sm px-6 text-center">
				<p className="text-zinc-200 font-medium text-base">Map unavailable</p>
				<p className="max-w-sm">
					After losing the GPU connection, {hint.name} has disabled WebGL for
					this tab. A page refresh won&apos;t help — you need to fully restart
					the browser.
				</p>
				<p className="text-zinc-500 text-xs">
					This happens when another tab (e.g. a video) reclaims the GPU and the
					browser can&apos;t recover.
				</p>
			</div>
		);
	}

	return (
		<div className="flex flex-col items-center justify-center h-full gap-4 text-zinc-400 text-sm px-6 text-center">
			<p className="text-zinc-200 font-medium text-base">Map unavailable</p>
			<p>WebGL failed to initialize in {hint.name}. Follow the steps below to fix it:</p>
			<p className="text-zinc-300">{hint.steps}</p>
			{hint.url && (
				<div className="flex items-center gap-2 bg-zinc-800 border border-zinc-600 rounded-md px-3 py-2 font-mono text-xs text-zinc-200">
					<span>{hint.url}</span>
					<button
						onClick={copyUrl}
						className="ml-1 text-zinc-400 hover:text-zinc-100 transition-colors"
						title="Copy URL"
					>
						{copied ? <Check size={14} /> : <Copy size={14} />}
					</button>
				</div>
			)}
			<p className="text-zinc-500 text-xs">
				Paste the URL above into your address bar to open the settings page.
			</p>
		</div>
	);
}

interface MarkerAnimation {
	fromLat: number;
	fromLon: number;
	toLat: number;
	toLon: number;
	startAt: number;
	durationMs: number;
}

function hasValidCoords(m: StaticMarker): boolean {
	const c = m.coords;
	return (
		!!c &&
		typeof c.lat === "number" &&
		typeof c.lon === "number" &&
		Number.isFinite(c.lat) &&
		Number.isFinite(c.lon)
	);
}

const INITIAL_FIT_OPTIONS: mapboxgl.FitBoundsOptions = {
	padding: 120,
	maxZoom: 13,
	duration: 0,
};

const FALLBACK_CENTER: [number, number] = [-91.22, 43.85];
const FALLBACK_ZOOM = 10;

// Compute an initial viewport that frames the bulk of the markers. Trims the
// outermost 10% on each axis (once there are enough markers) so a single
// far-away tech or client doesn't dominate the framing.
function computeInitialBounds(
	markers: StaticMarker[],
): [[number, number], [number, number]] | null {
	const valid = markers.filter(hasValidCoords);
	if (valid.length === 0) return null;

	const lats = valid.map((m) => m.coords.lat).sort((a, b) => a - b);
	const lons = valid.map((m) => m.coords.lon).sort((a, b) => a - b);
	const n = valid.length;
	const trim = n >= 8 ? Math.floor(n * 0.1) : 0;

	return [
		[lons[trim], lats[trim]],
		[lons[n - 1 - trim], lats[n - 1 - trim]],
	];
}

interface DynamicMapProps {
	containerRef: React.RefObject<HTMLDivElement | null>;
	staticMarkers?: StaticMarker[];
	techRoutes?: TechRouteData[];
	showRoutes?: boolean;
}

const MIN_ANIM_MS = 1500;
const MAX_ANIM_MS = 5000;
const DEFAULT_ANIM_MS = 2500;

const DynamicMap = ({
	containerRef,
	staticMarkers = [],
	techRoutes = [],
	showRoutes = false,
}: DynamicMapProps) => {
	const mapRef = useRef<mapboxgl.Map | null>(null);
	const markersRef = useRef<Map<string, mapboxgl.Marker>>(new Map());
	const hasFitRef = useRef(false);
	const markerFingerprintsRef = useRef<Map<string, string>>(new Map());
	const animationsRef = useRef<Map<string, MarkerAnimation>>(new Map());
	const lastUpdateAtRef = useRef<Map<string, number>>(new Map());
	const routeLayerIdsRef = useRef<Set<string>>(new Set());
	const rafRef = useRef<number | null>(null);
	const hadContextLoss = useRef(false);
	const hasDoneInitialFitRef = useRef(false);

	function markerFingerprint(m: StaticMarker): string {
		return `${m.type}|${m.label ?? ""}|${m.color ?? ""}|${m.statusDotColor ?? ""}|${m.variant ?? ""}`;
	}

	const [webglError, setWebglError] = useState(false);
	const [contextLost, setContextLost] = useState(false);
	const [styleReady, setStyleReady] = useState(false);
	const [initKey, setInitKey] = useState(0);

	useEffect(() => {
		if (mapRef.current) {
			try { mapRef.current.remove(); } catch { /* ignore lost-context errors on teardown */ }
			mapRef.current = null;
			markersRef.current.clear();
			markerFingerprintsRef.current.clear();
			animationsRef.current.clear();
			lastUpdateAtRef.current.clear();
			routeLayerIdsRef.current.clear();
		}
		if (!containerRef.current) return;

		setWebglError(false);
		setContextLost(false);
		setStyleReady(false);
		mapboxgl.accessToken = import.meta.env.VITE_MAPBOX_TOKEN;

		const initialBounds = computeInitialBounds(staticMarkers);
		hasDoneInitialFitRef.current = initialBounds !== null;

		try {
			mapRef.current = new mapboxgl.Map({
				container: containerRef.current,
				...(initialBounds
					? { bounds: initialBounds, fitBoundsOptions: INITIAL_FIT_OPTIONS }
					: { center: FALLBACK_CENTER, zoom: FALLBACK_ZOOM }),
				style: "mapbox://styles/mapbox/standard",
				minZoom: 5,
				maxZoom: 22,
				failIfMajorPerformanceCaveat: false,
				config: {
					basemap: {
						lightPreset: "dusk",
						showPointOfInterestLabels: false,
					},
				},
			});

			hadContextLoss.current = false;

			mapRef.current.on("style.load", () => setStyleReady(true));

			const canvas = mapRef.current.getCanvas();
			canvas.addEventListener("webglcontextlost", (e) => {
				e.preventDefault();
				hadContextLoss.current = true;
				setContextLost(true);
				setStyleReady(false);
			});
			canvas.addEventListener("webglcontextrestored", () => {
				setContextLost(false);
			});
		} catch {
			setWebglError(true);
		}

		const markers = markersRef.current;
		const fingerprints = markerFingerprintsRef.current;
		const anims = animationsRef.current;
		const lastUpdates = lastUpdateAtRef.current;
		const routeLayerIds = routeLayerIdsRef.current;

		return () => {
			if (rafRef.current !== null) {
				cancelAnimationFrame(rafRef.current);
				rafRef.current = null;
			}
			try { mapRef.current?.remove(); } catch { /* ignore lost-context errors on teardown */ }
			mapRef.current = null;
			markers.clear();
			fingerprints.clear();
			anims.clear();
			lastUpdates.clear();
			routeLayerIds.clear();
		};
	// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [initKey]);

	// If markers weren't ready at mount, fit to them on first arrival. Runs once
	// per map lifetime so later marker updates don't yank the user's view.
	useEffect(() => {
		if (hasDoneInitialFitRef.current) return;
		const map = mapRef.current;
		if (!map || contextLost) return;
		const bounds = computeInitialBounds(staticMarkers);
		if (!bounds) return;
		map.fitBounds(bounds, INITIAL_FIT_OPTIONS);
		hasDoneInitialFitRef.current = true;
	}, [staticMarkers, contextLost]);

	// Resize map once after the container stops changing.
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

	// Keep a single RAF loop running only while there are active animations.
	function ensureRafRunning() {
		if (rafRef.current !== null) return;
		const tick = () => {
			const now = performance.now();
			let anyActive = false;

			animationsRef.current.forEach((anim, id) => {
				const marker = markersRef.current.get(id);
				if (!marker) {
					animationsRef.current.delete(id);
					return;
				}
				const raw = (now - anim.startAt) / anim.durationMs;
				const t = raw >= 1 ? 1 : raw < 0 ? 0 : raw;
				// Ease-out cubic for a natural decelerating feel.
				const eased = 1 - Math.pow(1 - t, 3);
				const lon = anim.fromLon + (anim.toLon - anim.fromLon) * eased;
				const lat = anim.fromLat + (anim.toLat - anim.fromLat) * eased;
				marker.setLngLat([lon, lat]);
				if (t < 1) anyActive = true;
				else animationsRef.current.delete(id);
			});

			if (anyActive) {
				rafRef.current = requestAnimationFrame(tick);
			} else {
				rafRef.current = null;
			}
		};
		rafRef.current = requestAnimationFrame(tick);
	}

	// Marker sync: create/update/remove markers. Technician markers animate between pings.
	useEffect(() => {
		const map = mapRef.current;
		if (!map || contextLost) return;

		const currentIds = new Set<string>();

		staticMarkers.forEach((m) => {
			if (!hasValidCoords(m)) return;
			currentIds.add(m.id);

			const fp = markerFingerprint(m);
			const existing = markersRef.current.get(m.id);
			const prevFp = markerFingerprintsRef.current.get(m.id);
			const fpChanged = existing && prevFp !== fp;

			if (existing && fpChanged) {
				// Label / color / variant changed — rebuild the DOM at the current position
				// so visible state matches new props (e.g. ETA suffix toggled on/off).
				const pos = existing.getLngLat();
				existing.remove();
				markersRef.current.delete(m.id);
				const rebuilt = new mapboxgl.Marker({
					element: CreateMarker(m),
					anchor: "bottom",
				})
					.setLngLat(pos)
					.addTo(map);
				markersRef.current.set(m.id, rebuilt);
				markerFingerprintsRef.current.set(m.id, fp);
				// Fall through to the animation/move logic below using the rebuilt marker.
			}

			const marker = markersRef.current.get(m.id);
			if (marker) {
				if (m.type === "TECHNICIAN") {
					const pos = marker.getLngLat();
					const lastAt = lastUpdateAtRef.current.get(m.id);
					const durationMs = lastAt
						? Math.min(
								MAX_ANIM_MS,
								Math.max(MIN_ANIM_MS, performance.now() - lastAt),
							)
						: DEFAULT_ANIM_MS;

					animationsRef.current.set(m.id, {
						fromLat: pos.lat,
						fromLon: pos.lng,
						toLat: m.coords.lat,
						toLon: m.coords.lon,
						startAt: performance.now(),
						durationMs,
					});
					lastUpdateAtRef.current.set(m.id, performance.now());
					ensureRafRunning();
				} else {
					marker.setLngLat([m.coords.lon, m.coords.lat]);
				}
			} else {
				const created = new mapboxgl.Marker({
					element: CreateMarker(m),
					anchor: "bottom",
				})
					.setLngLat([m.coords.lon, m.coords.lat])
					.addTo(map);
				markersRef.current.set(m.id, created);
				markerFingerprintsRef.current.set(m.id, fp);
				if (m.type === "TECHNICIAN") {
					lastUpdateAtRef.current.set(m.id, performance.now());
				}
			}
		});

		markersRef.current.forEach((marker, id) => {
			if (!currentIds.has(id)) {
				marker.remove();
				markersRef.current.delete(id);
				markerFingerprintsRef.current.delete(id);
				animationsRef.current.delete(id);
				lastUpdateAtRef.current.delete(id);
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
	}, [staticMarkers, contextLost]);

	// Route sync: add/update/remove a line layer per active tech route.
	useEffect(() => {
		const map = mapRef.current;
		if (!map || !styleReady || contextLost) return;

		const nextIds = new Set<string>();

		if (showRoutes) {
			techRoutes.forEach((route) => {
				if (!route.routeGeoJSON) return;
				const layerId = `route-${route.techId}`;
				nextIds.add(layerId);

				const existingSource = map.getSource(layerId) as GeoJSONSource | undefined;
				if (existingSource) {
					existingSource.setData(route.routeGeoJSON);
					if (map.getLayer(layerId)) {
						map.setPaintProperty(layerId, "line-color", route.color);
					}
				} else {
					map.addSource(layerId, {
						type: "geojson",
						data: route.routeGeoJSON,
					});
					map.addLayer({
						id: layerId,
						type: "line",
						source: layerId,
						layout: { "line-cap": "round", "line-join": "round" },
						paint: {
							"line-color": route.color,
							"line-width": 5,
							"line-opacity": 0.8,
						},
					});
					routeLayerIdsRef.current.add(layerId);
				}
			});
		}

		Array.from(routeLayerIdsRef.current).forEach((layerId) => {
			if (nextIds.has(layerId)) return;
			if (map.getLayer(layerId)) map.removeLayer(layerId);
			if (map.getSource(layerId)) map.removeSource(layerId);
			routeLayerIdsRef.current.delete(layerId);
		});
	}, [techRoutes, showRoutes, styleReady, contextLost]);

	if (webglError) {
		return <WebGLErrorFallback afterContextLoss={hadContextLoss.current} />;
	}

	if (contextLost && containerRef.current) {
		return createPortal(
			<div
				style={{ position: "absolute", inset: 0, zIndex: 1000 }}
				className="flex flex-col items-center justify-center gap-3 bg-zinc-900/80 backdrop-blur-sm rounded-lg text-sm text-center px-6"
			>
				<p className="text-zinc-200 font-medium">Map lost GPU connection</p>
				<p className="text-zinc-400 text-xs max-w-xs">
					The browser reclaimed the GPU context, likely due to another tab using
					WebGL or hardware video. Click below to restore the map.
				</p>
				<button
					onClick={() => setInitKey((k) => k + 1)}
					className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-md text-white text-sm font-medium transition-colors"
				>
					<RefreshCw size={14} />
					Reload Map
				</button>
			</div>,
			containerRef.current
		);
	}

	return null;
};

export default DynamicMap;
