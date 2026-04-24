import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, ChevronLeft, ChevronRight } from "lucide-react";
import DynamicMap from "../../components/ui/maps/DynamicMap";
import MapPanel from "../../components/ui/maps/MapPanel";
import { useMapData } from "../../hooks/useMapData";

export default function FullMapPage() {
	const nav = useNavigate();
	const mapContainerRef = useRef<HTMLDivElement>(null!);
	const [panelOpen, setPanelOpen] = useState(true);
	const {
		markers,
		techRoutes,
		allTechnicians,
		allDrivingRoutes,
		allClients,
		filters,
		setFilters,
	} = useMapData();

	return (
		<div
			ref={mapContainerRef}
			className="absolute top-0 left-0 w-screen h-screen overflow-hidden text-white"
		>
			<DynamicMap
				containerRef={mapContainerRef}
				staticMarkers={markers}
				techRoutes={techRoutes}
				showRoutes={filters.showRoutes}
			/>

			<button
				onClick={() => nav("/dispatch/map")}
				className="absolute top-4 left-4 z-10 flex items-center justify-center w-9 h-9 bg-zinc-900/90 backdrop-blur border border-zinc-700 rounded-md hover:bg-zinc-800 transition-colors"
				title="Back to dashboard map"
			>
				<ArrowLeft size={16} />
			</button>

			<button
				onClick={() => setPanelOpen((v) => !v)}
				className="absolute top-4 right-4 z-10 flex items-center justify-center w-9 h-9 bg-zinc-900/90 backdrop-blur border border-zinc-700 rounded-md hover:bg-zinc-800 transition-colors"
				title={panelOpen ? "Hide panel" : "Show panel"}
			>
				{panelOpen ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
			</button>

			{panelOpen && (
				<div className="absolute top-16 right-4 bottom-4 w-80 z-10">
					<MapPanel
						allClients={allClients}
						allTechnicians={allTechnicians}
						drivingRoutes={allDrivingRoutes}
						filters={filters}
						onChange={setFilters}
					/>
				</div>
			)}
		</div>
	);
}
