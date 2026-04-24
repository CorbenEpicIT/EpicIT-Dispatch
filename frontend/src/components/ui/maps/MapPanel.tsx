import { useMemo, useState } from "react";
import { ChevronDown, Users, Wrench, Route, Clock } from "lucide-react";
import type { Technician } from "../../../types/technicians";
import { TechnicianStatusDotColors } from "../../../types/technicians";
import type { TechRouteData } from "../../../types/location";
import type { Client } from "../../../types/clients";

export interface MapFilters {
	showClients: boolean;
	hiddenClientIds: Set<string>;
	showRoutes: boolean;
	hiddenRouteIds: Set<string>;
	showETAs: boolean;
	hiddenETAIds: Set<string>;
	showTechs: boolean;
	hiddenTechIds: Set<string>;
}

interface MapPanelProps {
	allClients: Client[];
	allTechnicians: Technician[];
	drivingRoutes: TechRouteData[];
	filters: MapFilters;
	onChange: (next: MapFilters) => void;
}

function formatEta(seconds: number | null): string {
	if (seconds === null) return "…";
	const mins = Math.max(1, Math.round(seconds / 60));
	if (mins < 60) return `${mins} min`;
	const hours = Math.floor(mins / 60);
	const rem = mins % 60;
	return rem === 0 ? `${hours}h` : `${hours}h ${rem}m`;
}

function hasValidCoords(c: { lat: number; lon: number } | null | undefined): boolean {
	return (
		!!c &&
		Number.isFinite(c.lat) &&
		Number.isFinite(c.lon) &&
		!(c.lat === 0 && c.lon === 0)
	);
}

function toggleInSet(set: Set<string>, id: string): Set<string> {
	const next = new Set(set);
	if (next.has(id)) next.delete(id);
	else next.add(id);
	return next;
}

export default function MapPanel({
	allClients,
	allTechnicians,
	drivingRoutes,
	filters,
	onChange,
}: MapPanelProps) {
	const sortedClients = useMemo(
		() => [...allClients].sort((a, b) => a.name.localeCompare(b.name)),
		[allClients],
	);
	const sortedTechs = useMemo(
		() => [...allTechnicians].sort((a, b) => a.name.localeCompare(b.name)),
		[allTechnicians],
	);
	const sortedRoutes = useMemo(
		() => [...drivingRoutes].sort((a, b) => a.techName.localeCompare(b.techName)),
		[drivingRoutes],
	);

	return (
		<div className="flex flex-col bg-zinc-900 border border-zinc-800 rounded-xl w-full h-full overflow-hidden">
			<div className="px-4 py-3 border-b border-zinc-800">
				<h3 className="font-semibold text-white text-sm">Map Controls</h3>
				<p className="text-xs text-zinc-500 mt-0.5">
					Toggle resources to reduce clutter
				</p>
			</div>

			<div className="flex-1 overflow-y-auto">
				<Section
					icon={<Users size={14} />}
					title="Clients"
					count={sortedClients.length}
					master={filters.showClients}
					onMaster={(v) => onChange({ ...filters, showClients: v })}
					defaultOpen={false}
				>
					{sortedClients.length === 0 ? (
						<EmptyHint>No clients.</EmptyHint>
					) : (
						sortedClients.map((c) => {
							const validCoords = hasValidCoords(c.coords);
							const hidden = filters.hiddenClientIds.has(c.id);
							return (
								<ItemToggle
									key={c.id}
									checked={!hidden}
									disabled={!validCoords || !filters.showClients}
									onChange={() =>
										onChange({
											...filters,
											hiddenClientIds: toggleInSet(
												filters.hiddenClientIds,
												c.id,
											),
										})
									}
									label={c.name}
									sublabel={validCoords ? undefined : "no location"}
									dot={
										<span className="w-2 h-2 rounded-full bg-blue-500 flex-shrink-0" />
									}
								/>
							);
						})
					)}
				</Section>

				<Section
					icon={<Route size={14} />}
					title="Routes"
					count={sortedRoutes.length}
					master={filters.showRoutes}
					onMaster={(v) => onChange({ ...filters, showRoutes: v })}
					defaultOpen={true}
				>
					{sortedRoutes.length === 0 ? (
						<EmptyHint>No technicians currently driving.</EmptyHint>
					) : (
						sortedRoutes.map((route) => {
							const hidden = filters.hiddenRouteIds.has(route.techId);
							return (
								<ItemToggle
									key={route.techId}
									checked={!hidden}
									disabled={!filters.showRoutes}
									onChange={() =>
										onChange({
											...filters,
											hiddenRouteIds: toggleInSet(
												filters.hiddenRouteIds,
												route.techId,
											),
										})
									}
									label={route.techName}
									sublabel={`→ ${route.destinationLabel}`}
									dot={
										<span
											className="w-3 h-3 rounded-full flex-shrink-0 border border-zinc-950"
											style={{ backgroundColor: route.color }}
										/>
									}
								/>
							);
						})
					)}
				</Section>

				<Section
					icon={<Clock size={14} />}
					title="ETA Labels"
					count={sortedRoutes.length}
					master={filters.showETAs}
					onMaster={(v) => onChange({ ...filters, showETAs: v })}
					defaultOpen={false}
				>
					{sortedRoutes.length === 0 ? (
						<EmptyHint>No active ETAs.</EmptyHint>
					) : (
						sortedRoutes.map((route) => {
							const hidden = filters.hiddenETAIds.has(route.techId);
							return (
								<ItemToggle
									key={route.techId}
									checked={!hidden}
									disabled={!filters.showETAs}
									onChange={() =>
										onChange({
											...filters,
											hiddenETAIds: toggleInSet(
												filters.hiddenETAIds,
												route.techId,
											),
										})
									}
									label={route.techName}
									sublabel={formatEta(route.etaSeconds)}
									dot={
										<span
											className="w-3 h-3 rounded-full flex-shrink-0 border border-zinc-950"
											style={{ backgroundColor: route.color }}
										/>
									}
								/>
							);
						})
					)}
				</Section>

				<Section
					icon={<Wrench size={14} />}
					title="Technicians"
					count={sortedTechs.length}
					master={filters.showTechs}
					onMaster={(v) => onChange({ ...filters, showTechs: v })}
					defaultOpen={true}
				>
					{sortedTechs.length === 0 ? (
						<EmptyHint>No technicians.</EmptyHint>
					) : (
						sortedTechs.map((tech) => {
							const validCoords = hasValidCoords(tech.coords);
							const hidden = filters.hiddenTechIds.has(tech.id);
							return (
								<ItemToggle
									key={tech.id}
									checked={!hidden}
									disabled={!validCoords || !filters.showTechs}
									onChange={() =>
										onChange({
											...filters,
											hiddenTechIds: toggleInSet(
												filters.hiddenTechIds,
												tech.id,
											),
										})
									}
									label={tech.name}
									sublabel={
										validCoords
											? tech.status
											: "no location"
									}
									dot={
										<span
											className={`w-2 h-2 rounded-full flex-shrink-0 ${TechnicianStatusDotColors[tech.status]}`}
										/>
									}
								/>
							);
						})
					)}
				</Section>
			</div>
		</div>
	);
}

interface SectionProps {
	icon: React.ReactNode;
	title: string;
	count: number;
	master: boolean;
	onMaster: (next: boolean) => void;
	defaultOpen?: boolean;
	children: React.ReactNode;
}

function Section({
	icon,
	title,
	count,
	master,
	onMaster,
	defaultOpen = false,
	children,
}: SectionProps) {
	const [open, setOpen] = useState(defaultOpen);
	return (
		<section className="border-b border-zinc-800">
			<div className="flex items-center gap-2 px-3 py-2 hover:bg-zinc-800/40 transition-colors">
				<button
					onClick={() => setOpen((v) => !v)}
					className="flex items-center gap-2 flex-1 text-left"
				>
					<ChevronDown
						size={14}
						className={`text-zinc-500 transition-transform ${open ? "" : "-rotate-90"}`}
					/>
					<span className="text-zinc-400 flex-shrink-0">{icon}</span>
					<span className="text-xs font-semibold text-zinc-200 uppercase tracking-wider">
						{title}
					</span>
					<span className="text-[10px] text-zinc-500">({count})</span>
				</button>
				<input
					type="checkbox"
					checked={master}
					onChange={(e) => onMaster(e.target.checked)}
					className="accent-blue-500 cursor-pointer"
					title={`Toggle all ${title.toLowerCase()}`}
				/>
			</div>
			{open && <ul className="px-2 pb-2 space-y-0.5">{children}</ul>}
		</section>
	);
}

interface ItemToggleProps {
	checked: boolean;
	disabled?: boolean;
	onChange: () => void;
	label: string;
	sublabel?: string;
	dot?: React.ReactNode;
}

function ItemToggle({ checked, disabled, onChange, label, sublabel, dot }: ItemToggleProps) {
	return (
		<li>
			<label
				className={`flex items-center gap-2 px-2 py-1.5 rounded-md transition-colors ${
					disabled
						? "opacity-40 cursor-not-allowed"
						: "hover:bg-zinc-800 cursor-pointer"
				}`}
			>
				{dot}
				<div className="min-w-0 flex-1">
					<p className="text-xs text-zinc-200 truncate">{label}</p>
					{sublabel && (
						<p className="text-[10px] text-zinc-500 truncate">{sublabel}</p>
					)}
				</div>
				<input
					type="checkbox"
					checked={checked}
					disabled={disabled}
					onChange={onChange}
					className="accent-blue-500"
				/>
			</label>
		</li>
	);
}

function EmptyHint({ children }: { children: React.ReactNode }) {
	return <li className="text-xs text-zinc-600 italic px-2 py-1.5">{children}</li>;
}
