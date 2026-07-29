import { useNavigate } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import Card from "../ui/Card";
import type { MileageReportVisit } from "../../types/reports";

interface MileageSummaryCardProps {
	data: MileageReportVisit[];
	rangeLabel: string;
}

export default function MileageSummaryCard({ data, rangeLabel }: MileageSummaryCardProps) {
	const navigate = useNavigate();

	const totalMiles = data.reduce((sum, v) => sum + v.miles, 0);
	const visitCount = data.length;
	const avgMiles = visitCount > 0 ? totalMiles / visitCount : 0;
	const uniqueTechs = new Set(
		data.flatMap((v) => v.technicianNames.split(", ").filter(Boolean)),
	).size;

	return (
		<Card
			title="Technician Mileage"
			headerAction={
				<span className="text-sm font-semibold text-text-primary tabular-nums">
					{totalMiles.toFixed(1)} mi
				</span>
			}
		>
			<div className="grid grid-cols-3 gap-3 mb-4">
				<div className="bg-surface/50 rounded-lg p-3 text-center">
					<p className="text-2xl font-bold text-text-primary tabular-nums">
						{totalMiles.toFixed(1)}
					</p>
					<p className="text-xs text-text-muted mt-1">Total Miles</p>
				</div>
				<div className="bg-surface/50 rounded-lg p-3 text-center">
					<p className="text-2xl font-bold text-text-primary tabular-nums">
						{avgMiles.toFixed(1)}
					</p>
					<p className="text-xs text-text-muted mt-1">Avg / Visit</p>
				</div>
				<div className="bg-surface/50 rounded-lg p-3 text-center">
					<p className="text-2xl font-bold text-text-primary tabular-nums">
						{uniqueTechs}
					</p>
					<p className="text-xs text-text-muted mt-1">Technicians</p>
				</div>
			</div>

			<div className="flex items-center justify-between">
				<p className="text-xs text-text-muted">
					{visitCount} visit{visitCount !== 1 ? "s" : ""} · {rangeLabel}
				</p>
				<button
					onClick={() => navigate("/dispatch/mileage?date=this_week")}
					className="flex items-center gap-1.5 text-xs text-primary-text hover:text-text-primary transition-colors font-medium"
				>
					View All
					<ArrowRight size={12} />
				</button>
			</div>
		</Card>
	);
}
