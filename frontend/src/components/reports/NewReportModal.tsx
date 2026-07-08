import { useState } from "react";
import { FileText, X } from "lucide-react";
import { useNavigate } from "react-router-dom";
import FullPopup from "../ui/FullPopup";
import { REPORT_SOURCES } from "../../reports/reportSources";
import { clearNewReportState } from "../../reports/reportBuilderState";

interface NewReportModalProps {
	isOpen: boolean;
	onClose: () => void;
}

export default function NewReportModal({ isOpen, onClose }: NewReportModalProps) {
	const navigate = useNavigate();
	const [sourceId, setSourceId] = useState<string>(REPORT_SOURCES[0]?.id ?? "");

	const canCreate = sourceId.length > 0;

	const handleCreate = () => {
		if (!canCreate) return;
		clearNewReportState(sourceId);
		const params = new URLSearchParams({ source: sourceId });
		navigate(`/dispatch/reporting/builder?${params.toString()}`);
	};

	const content = (
		<div className="flex flex-col">
			<div className="flex items-center justify-between px-6 py-4 border-b border-border-subtle">
				<div className="flex items-center gap-2">
					<FileText size={18} className="text-text-tertiary" />
					<h2 className="text-base font-semibold text-text-primary">New Report</h2>
				</div>
				<button
					onClick={onClose}
					aria-label="Close"
					className="text-text-muted hover:text-text-primary p-1 -mr-1 rounded-md hover:bg-surface-raised transition-colors"
				>
					<X size={16} />
				</button>
			</div>

			<div className="px-6 py-5 space-y-5">
				<div>
					<p className="text-xs text-text-muted uppercase tracking-wide font-semibold mb-1.5">
						Template
					</p>
					<div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
						{REPORT_SOURCES.map((source) => {
							const selected = sourceId === source.id;
							return (
								<button
									key={source.id}
									type="button"
									onClick={() => setSourceId(source.id)}
									aria-pressed={selected}
									className={`text-left rounded-lg border p-3 transition-all ${
										selected
											? "border-primary bg-primary-bg"
											: "border-border-subtle bg-base hover:bg-surface hover:border-border"
									}`}
								>
									<p
										className={`text-sm font-semibold ${
											selected ? "text-primary-text" : "text-text-primary"
										}`}
									>
										{source.label}
									</p>
									<p className="text-xs text-text-muted mt-0.5">{source.description}</p>
								</button>
							);
						})}
					</div>
				</div>
			</div>

			<div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-border-subtle">
				<button
					onClick={onClose}
					className="px-4 h-9 text-sm rounded-md border border-border text-text-tertiary hover:bg-surface hover:text-text-primary transition-colors"
				>
					Cancel
				</button>
				<button
					onClick={handleCreate}
					disabled={!canCreate}
					className="px-4 h-9 text-sm rounded-md bg-primary hover:bg-primary-hover text-on-primary font-semibold disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
				>
					Create Report
				</button>
			</div>
		</div>
	);

	return <FullPopup content={content} isModalOpen={isOpen} onClose={onClose} size="md" />;
}
