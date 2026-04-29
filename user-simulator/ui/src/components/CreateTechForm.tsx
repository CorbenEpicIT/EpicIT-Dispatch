import { useState } from "react";
import { api } from "../api";

type Props = {
	onDone: () => void;
	notify: (kind: "success" | "error", text: string) => void;
};

export function CreateTechForm({ onDone, notify }: Props) {
	const [name, setName] = useState("");
	const [lat, setLat] = useState("");
	const [lon, setLon] = useState("");
	const [busy, setBusy] = useState(false);

	async function submit(e: React.FormEvent) {
		e.preventDefault();
		if (!name.trim()) return;
		setBusy(true);
		try {
			const coords =
				lat && lon ? { lat: Number(lat), lon: Number(lon) } : undefined;
			await api.createTech(name.trim(), coords);
			notify("success", `Tech "${name}" created`);
			setName("");
			setLat("");
			setLon("");
			onDone();
		} catch (err) {
			notify("error", (err as Error).message);
		} finally {
			setBusy(false);
		}
	}

	return (
		<form className="sim-form" onSubmit={submit}>
			<label>
				Name
				<input
					value={name}
					onChange={(e) => setName(e.target.value)}
					placeholder="Sim 1"
				/>
			</label>
			<div className="row">
				<label>
					Lat (optional)
					<input
						value={lat}
						onChange={(e) => setLat(e.target.value)}
						placeholder="defaults to home"
					/>
				</label>
				<label>
					Lon (optional)
					<input
						value={lon}
						onChange={(e) => setLon(e.target.value)}
						placeholder="defaults to home"
					/>
				</label>
			</div>
			<button className="primary" type="submit" disabled={busy}>
				{busy ? "Creating…" : "Create Tech"}
			</button>
		</form>
	);
}
