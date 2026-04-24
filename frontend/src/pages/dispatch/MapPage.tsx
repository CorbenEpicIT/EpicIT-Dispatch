import { useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Expand } from "lucide-react";
import Card from "../../components/ui/Card";
import DynamicMap from "../../components/ui/maps/DynamicMap";
import MapPanel from "../../components/ui/maps/MapPanel";
import { useMapData } from "../../hooks/useMapData";

export default function MapPage() {
	const nav = useNavigate();
	const mapContainerRef = useRef<HTMLDivElement>(null);
	const {
		markers,
		techRoutes,
		allTechnicians,
		allDrivingRoutes,
		allClients,
		filters,
		setFilters,
		isLoading,
	} = useMapData();

	if (isLoading) return <p>Loading map data...</p>;

	return (
		<div className="flex flex-col lg:flex-row gap-4 h-fit">
			<div className="flex-1 min-w-0">
				<Card
					title="Map View"
					className="h-fit"
					headerAction={
						<button
							className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-md text-sm font-medium transition-colors"
							onClick={() => nav("/map")}
						>
							<Expand size={16} className="text-white" />
							View Fullscreen
						</button>
					}
				>
					<div className="space-y-4">
						<div
							ref={mapContainerRef}
							className="w-full h-[700px] bg-zinc-800 rounded-lg border border-zinc-700 overflow-hidden"
						>
							<DynamicMap
								containerRef={mapContainerRef}
								staticMarkers={markers}
								techRoutes={techRoutes}
								showRoutes={filters.showRoutes}
							/>
						</div>

						<div className="flex items-center justify-between text-sm text-zinc-400">
							<span>Live Tracking Active</span>
							<span>
								Last Pulse: {new Date().toLocaleTimeString()}
							</span>
						</div>
					</div>
				</Card>
			</div>

			<div className="lg:w-80 lg:flex-shrink-0 lg:h-[784px]">
				<MapPanel
					allClients={allClients}
					allTechnicians={allTechnicians}
					drivingRoutes={allDrivingRoutes}
					filters={filters}
					onChange={setFilters}
				/>
			</div>
		</div>
	);
}
