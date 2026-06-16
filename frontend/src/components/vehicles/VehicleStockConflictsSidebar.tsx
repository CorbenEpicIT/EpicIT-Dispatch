import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronLeft, ChevronRight, AlertTriangle, CheckCircle } from "lucide-react";
import { useVehicleStockConflictsQuery } from "../../hooks/useVehicleStock";
import type { VehicleStockConflict } from "../../types/vehicles";

export default function VehicleStockConflictsSidebar() {
	const [isCollapsed, setIsCollapsed] = useState(true);
	const navigate = useNavigate();
	const { data: conflicts = [] } = useVehicleStockConflictsQuery();

	const outCount = conflicts.filter((c) => c.severity === "out").length;
	const lowCount = conflicts.filter((c) => c.severity === "low").length;
	const totalCount = conflicts.length;

	const panelStatus = outCount > 0 ? "critical" : lowCount > 0 ? "warning" : "healthy";

	return (
		<div
			className={`
				fixed top-16 right-0 h-[calc(100vh-4rem)] bg-base/95 backdrop-blur-sm
				border-l border-border/50 shadow-2xl shadow-black/50
				transition-all duration-300 ease-in-out z-40
				${isCollapsed ? "w-12" : "w-80"}
			`}
		>
			{/* Toggle button */}
			<button
				onClick={() => setIsCollapsed(!isCollapsed)}
				className="absolute -left-3 top-1/2 -translate-y-1/2 bg-surface hover:bg-surface-raised text-text-secondary hover:text-text-primary p-1.5 rounded-full border border-border-strong shadow-lg transition-all z-50"
			>
				{isCollapsed ? <ChevronLeft size={14} /> : <ChevronRight size={14} />}
			</button>

			{/* Expanded */}
			{!isCollapsed && (
				<div className="h-full flex flex-col overflow-hidden">
					<div className="px-4 pt-4 pb-3 border-b border-border-subtle">
						<div className="flex items-center justify-between mb-1">
							<h3 className="text-sm font-semibold text-text-primary flex items-center gap-2">
								{panelStatus === "healthy"
									? <CheckCircle size={16} className="text-success" />
									: <AlertTriangle size={16} className={panelStatus === "critical" ? "text-error-text" : "text-warning-text"} />
								}
								Visit Stock Conflicts
							</h3>
							<div className="flex items-center gap-1">
								{outCount > 0 && <span className="bg-error/20 text-error-text text-[10px] font-bold px-2 py-0.5 rounded-full">{outCount} out</span>}
								{lowCount > 0 && <span className="bg-warning-bg text-warning-text text-[10px] font-bold px-2 py-0.5 rounded-full">{lowCount} low</span>}
							</div>
						</div>
						<p className="text-xs text-text-muted">
							{totalCount === 0 ? "All visits fully stocked" : "Upcoming visits missing required items"}
						</p>
					</div>

					<div className="flex-1 overflow-y-auto px-3 py-3 space-y-2 scrollbar-thin">
						{totalCount === 0 ? (
							<div className="flex flex-col items-center justify-center h-full text-center px-4">
								<div className="w-10 h-10 rounded-full bg-success/10 flex items-center justify-center mb-3">
									<CheckCircle size={20} className="text-success" />
								</div>
								<p className="text-text-secondary text-xs font-medium">All stocked up</p>
								<p className="text-text-muted text-xs mt-1">No upcoming visit conflicts</p>
							</div>
						) : (
							conflicts.map((conflict, idx) => (
								<ConflictCard
									key={`${conflict.visitId}-${conflict.vehicleId}-${idx}`}
									conflict={conflict}
									onClick={() => navigate(`/dispatch/vehicles/${conflict.vehicleId}/stock`)}
								/>
							))
						)}
					</div>
				</div>
			)}

			{/* Collapsed */}
			{isCollapsed && (
				<div className="flex flex-col items-center pt-4 gap-2">
					{totalCount === 0 ? (
						<CheckCircle size={16} className="text-success" />
					) : (
						<>
							<AlertTriangle size={16} className={outCount > 0 ? "text-error-text" : "text-warning-text"} />
							<span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${outCount > 0 ? "bg-error/20 text-error-text" : "bg-warning-bg text-warning-text"}`}>
								{totalCount}
							</span>
						</>
					)}
				</div>
			)}
		</div>
	);
}

function ConflictCard({ conflict, onClick }: { conflict: VehicleStockConflict; onClick: () => void }) {
	const time = conflict.scheduledAt
		? new Date(conflict.scheduledAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
		: "";
	const isOut = conflict.severity === "out";
	const techLabel = conflict.techNames.length <= 2
		? conflict.techNames.join(", ")
		: `${conflict.techNames[0]} +${conflict.techNames.length - 1}`;

	return (
		<div
			onClick={onClick}
			className="bg-surface rounded-lg overflow-hidden border border-border cursor-pointer hover:bg-surface-raised transition-colors"
		>
			{/* Status bar */}
			<div className={`px-3 py-1.5 flex items-center justify-between ${isOut ? "bg-error/15" : "bg-warning/10"}`}>
				<span className={`text-[10px] font-bold tracking-wide ${isOut ? "text-error-text" : "text-warning-text"}`}>
					{isOut ? "OUT OF STOCK" : "LOW STOCK"}
				</span>
				<span className={`text-[10px] opacity-70 ${isOut ? "text-error-text" : "text-warning-text"}`}>{time}</span>
			</div>

			{/* Two-column identity */}
			<div className="grid grid-cols-2 divide-x divide-border">
				<div className="px-3 py-2">
					<div className="text-[9px] font-semibold text-text-muted uppercase tracking-wider mb-1">Visit</div>
					<div className="text-xs font-semibold text-text-primary leading-snug">{conflict.visitName}</div>
					<div className="text-[11px] text-text-secondary mt-0.5 truncate">{conflict.clientName}</div>
				</div>
				<div className="px-3 py-2">
					<div className="text-[9px] font-semibold text-text-muted uppercase tracking-wider mb-1">Vehicle</div>
					<div className="text-xs font-semibold text-text-primary leading-snug">{conflict.vehicleName}</div>
					<div className="text-[11px] text-text-secondary mt-0.5 truncate">
						{techLabel || <span className="italic text-text-faint">Unassigned</span>}
					</div>
				</div>
			</div>

			{/* Item rows */}
			<div className="px-3 pb-2 space-y-1">
				{conflict.conflicts.map((item) => (
					<div key={item.inventoryItemId} className="flex items-center justify-between bg-canvas rounded px-2 py-1">
						<span className="text-xs text-text-primary truncate mr-2">{item.itemName}</span>
						<div className="flex items-center gap-2 flex-shrink-0">
							<span className="text-[11px] text-text-muted">Need <span className="text-text-primary font-semibold">{item.qtyNeeded}</span></span>
							<span className={`text-[11px] font-bold ${item.qtyOnHand === 0 ? "text-error-text" : "text-warning-text"}`}>
								Have {item.qtyOnHand}
							</span>
						</div>
					</div>
				))}
			</div>
		</div>
	);
}
