import { useState } from "react";
import { api, type TechSnapshot } from "../api";

type Props = {
	techs: TechSnapshot[];
	onDone: () => void;
	notify: (kind: "success" | "error", text: string) => void;
};

export function TechList({ techs, onDone, notify }: Props) {
	const [busy, setBusy] = useState<string | null>(null);

	async function run(
		id: string,
		label: string,
		fn: () => Promise<unknown>,
	) {
		setBusy(`${id}:${label}`);
		try {
			await fn();
			notify("success", `${label} ok`);
			onDone();
		} catch (err) {
			notify("error", (err as Error).message);
		} finally {
			setBusy(null);
		}
	}

	if (techs.length === 0) {
		return <p style={{ color: "#666", fontSize: 13 }}>No simulated techs yet.</p>;
	}

	return (
		<div className="tech-list">
			{techs.map((t) => (
				<div className="tech-row" key={t.techId}>
					<div>
						<span className="name">{t.name}</span>{" "}
						<span className={`badge ${t.isActive ? "active" : ""}`}>
							{t.isActive ? "active" : "paused"}
						</span>{" "}
						<span className="badge">{t.state}</span>
					</div>
					<div className="meta">
						<span>id: {t.techId.slice(0, 8)}…</span>
						<span>
							coords: {t.coords.lat.toFixed(5)},{" "}
							{t.coords.lon.toFixed(5)}
						</span>
						{t.currentVisitId && (
							<span>visit: {t.currentVisitId.slice(0, 8)}…</span>
						)}
					</div>
					<div className="buttons">
						<button
							className="secondary"
							disabled={t.isActive || busy === `${t.techId}:Start`}
							onClick={() =>
								run(t.techId, "Start", () => api.startTech(t.techId))
							}
						>
							Start
						</button>
						<button
							className="secondary"
							disabled={!t.isActive || busy === `${t.techId}:Pause`}
							onClick={() =>
								run(t.techId, "Pause", () => api.pauseTech(t.techId))
							}
						>
							Pause
						</button>
						<button
							className="secondary"
							disabled={busy === `${t.techId}:Replay`}
							onClick={() =>
								run(t.techId, "Replay", () => api.replayTech(t.techId))
							}
						>
							Replay
						</button>
					</div>
				</div>
			))}
		</div>
	);
}
