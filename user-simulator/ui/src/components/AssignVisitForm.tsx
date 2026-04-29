import { useCallback, useEffect, useState } from "react";
import { api, type TechSnapshot, type VisitLite } from "../api";

type Props = {
	techs: TechSnapshot[];
	notify: (kind: "success" | "error", text: string) => void;
};

export function AssignVisitForm({ techs, notify }: Props) {
	const [visits, setVisits] = useState<VisitLite[]>([]);
	const [visitId, setVisitId] = useState("");
	const [techIds, setTechIds] = useState<string[]>([]);
	const [busy, setBusy] = useState(false);

	const refresh = useCallback(async () => {
		try {
			const list = await api.listScheduledVisits();
			setVisits(list);
		} catch (err) {
			notify("error", (err as Error).message);
		}
	}, [notify]);

	useEffect(() => {
		refresh();
	}, [refresh]);

	async function submit(e: React.FormEvent) {
		e.preventDefault();
		if (!visitId || techIds.length === 0) return;
		setBusy(true);
		try {
			await api.assignVisit(visitId, techIds);
			notify("success", "Visit assigned");
			setVisitId("");
			setTechIds([]);
			refresh();
		} catch (err) {
			notify("error", (err as Error).message);
		} finally {
			setBusy(false);
		}
	}

	return (
		<form className="sim-form" onSubmit={submit}>
			<label>
				Scheduled visit
				<select
					value={visitId}
					onChange={(e) => setVisitId(e.target.value)}
				>
					<option value="">-- select --</option>
					{visits.map((v) => (
						<option key={v.id} value={v.id}>
							{v.job?.name ?? v.name ?? v.id.slice(0, 8)} —{" "}
							{new Date(v.scheduled_start_at).toLocaleString()}
						</option>
					))}
				</select>
			</label>
			<label>
				Technicians
				<select
					multiple
					size={Math.min(6, Math.max(3, techs.length))}
					value={techIds}
					onChange={(e) =>
						setTechIds(
							Array.from(e.target.selectedOptions).map((o) => o.value),
						)
					}
				>
					{techs.map((t) => (
						<option key={t.techId} value={t.techId}>
							{t.name}
						</option>
					))}
				</select>
			</label>
			<div className="row">
				<button className="primary" type="submit" disabled={busy}>
					{busy ? "Assigning…" : "Assign"}
				</button>
				<button
					className="secondary"
					type="button"
					onClick={refresh}
					disabled={busy}
				>
					Refresh
				</button>
			</div>
		</form>
	);
}
