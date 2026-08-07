import { useNavigate } from "react-router-dom";
import { Plus, X } from "lucide-react";
import Card from "../ui/Card";
import AdaptableTable from "../AdaptableTable";
import { usePermission } from "../../hooks/usePermission";
import { JobStatusColors, JobStatusLabels, type JobStatus } from "../../types/jobs";
import { PriorityColors, PriorityLabels, type Priority } from "../../types/common";
import { formatCurrency } from "../../util/util"
import type { ProjectAttachedJob } from "../../types/project";

type JobRow = {
	id: string;
	job: string;
	status: JobStatus;
	priority: Priority;
	estimated: string;
	actual: string;
	_name: string;
	_client: string;
	_est: number;
	_act: number;
};

interface AttachedJobsCardProps {
	jobs: ProjectAttachedJob[];
	onAttach: () => void;
	onDetach: (jobId: string) => void;
	className?: string;
}

export default function AttachedJobsCard({ jobs, onAttach, onDetach, className }: AttachedJobsCardProps) {
	const navigate = useNavigate();
	const ATTACH_JOBS = usePermission("edit_projects");

	const jobRows = jobs.map((j) => ({
		id: j.id,
		job: j.job_number,
		status: j.status,
		priority: j.priority,
		estimated: formatCurrency(Number(j.estimated_total ?? 0)),
		actual: "",
		_name: j.name,
		_client: j.client?.name ?? "",
		_est: Number(j.estimated_total ?? 0),
		_act: Number(j.actual_total ?? 0),
	}));

	const sumEst = jobs.reduce((a, j) => a + Number(j.estimated_total ?? 0), 0);
	const sumAct = jobs.reduce((a, j) => a + Number(j.actual_total ?? 0), 0);

	return (
		<Card
			title="Attached Jobs"
			className={className}
			headerAction={
				ATTACH_JOBS && (
					<button
						className="flex items-center gap-2 px-4 py-2 bg-primary-hover hover:enabled:bg-primary-active rounded-md text-sm font-medium text-on-primary transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
						onClick={onAttach}
					>
						<Plus size={16} />
						Attach Job
					</button>
				)
			}
		>
			<AdaptableTable
				data={jobRows}
				headerLabels={{
					job: "Job",
					estimated: "Estimated",
					actual: "Actual",
				}}
				columnAlign={{
					estimated: "right",
					actual: "right",
				}}
				onRowClick={(row) => navigate(`/dispatch/jobs/${row.id}`)}
				footerRow={{
					job: "Total",
					estimated: formatCurrency(sumEst),
					actual: formatCurrency(sumAct),
				}}
				cellRenderers={{
					job: (row) => {
						const r = row as JobRow;
						return (
							<div className="flex flex-col">
								<span className="font-mono text-xs font-semibold text-primary-text">{r.job}</span>
								<span className="font-medium text-text-primary">{r._name}</span>
								<span className="text-xs text-text-muted">{r._client}</span>
							</div>
						);
					},
					status: (row) => {
						const r = row as JobRow;
						return (
							<div className={`w-fit px-2 py-1 rounded-full border text-xs font-medium ${JobStatusColors[r.status]}`}>
								{JobStatusLabels[r.status]}
							</div>
						);
					},
					priority: (row) => {
						const r = row as JobRow;
						return (
							<span className={`px-2 py-1 rounded-md border text-xs font-medium ${PriorityColors[r.priority]}`}>
								{PriorityLabels[r.priority]}
							</span>
						);
					},
					actual: (row) => {
						const r = row as JobRow;
						const over = r._act > r._est;
						return (
							<span className={`tabular-nums ${over ? "text-error-text font-semibold" : ""}`}>
								{r._act !== 0 ? formatCurrency(r._act) : "—"}
							</span>
						);
					},
				}}
				actionColumn={{
					header: "",
					cell: (row) => (
						<button
							title="Detach job from project"
							onClick={(e) => {
								e.stopPropagation();
								onDetach(row.id as string);
							}}
							className="p-1 rounded text-text-muted hover:text-error-text hover:bg-error-bg hover:cursor-pointer"
						>
							<X size={16} />
						</button>
					),
				}}
			/>
		</Card>
	);
}
