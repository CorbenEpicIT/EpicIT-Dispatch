import { useState } from "react";
import { api } from "../api";

type Props = {
	notify: (kind: "success" | "error", text: string) => void;
};

export function CreateClientForm({ notify }: Props) {
	const [name, setName] = useState("");
	const [address, setAddress] = useState("");
	const [lat, setLat] = useState("");
	const [lon, setLon] = useState("");
	const [busy, setBusy] = useState(false);

	async function submit(e: React.FormEvent) {
		e.preventDefault();
		if (!name.trim() || !address.trim() || !lat || !lon) return;
		setBusy(true);
		try {
			await api.createClient({
				name: name.trim(),
				address: address.trim(),
				coords: { lat: Number(lat), lon: Number(lon) },
			});
			notify("success", `Client "${name}" created`);
			setName("");
			setAddress("");
			setLat("");
			setLon("");
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
				<input value={name} onChange={(e) => setName(e.target.value)} />
			</label>
			<label>
				Address
				<input
					value={address}
					onChange={(e) => setAddress(e.target.value)}
				/>
			</label>
			<div className="row">
				<label>
					Lat
					<input value={lat} onChange={(e) => setLat(e.target.value)} />
				</label>
				<label>
					Lon
					<input value={lon} onChange={(e) => setLon(e.target.value)} />
				</label>
			</div>
			<button className="primary" type="submit" disabled={busy}>
				{busy ? "Creating…" : "Create Client"}
			</button>
		</form>
	);
}
