import { useMemo, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Expand } from "lucide-react";
import Card from "../../components/ui/Card";
import DynamicMap from "../../components/ui/maps/DynamicMap";
import { useAllClientsQuery } from "../../hooks/useClients";
import { useLiveTechnicians } from "../../hooks/useTechnicianMarkers";

export default function MapPage() {
	const nav = useNavigate();
	const { markers, isLoading } = useLiveTechnicians();
	const { data: clients } = useAllClientsQuery();
	const mapContainerRef = useRef<HTMLDivElement>(null);

	const allMarkers = useMemo(() => {
		const clientMarkers =
			clients?.map((c) => ({
				coords: c.coords,
				type: "CLIENT" as const,
				label: c.name,
			})) || [];
		return [...clientMarkers, ...markers];
	}, [clients, markers]);

	if (isLoading) return <p>Loading map data...</p>;

	return (
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
						staticMarkers={allMarkers}
					/>
				</div>

				<div className="flex items-center justify-between text-sm text-zinc-400">
					<span>Live Tracking Active</span>
					<span>Last Pulse: {new Date().toLocaleTimeString()}</span>
				</div>
			</div>
		</Card>
	);
}
