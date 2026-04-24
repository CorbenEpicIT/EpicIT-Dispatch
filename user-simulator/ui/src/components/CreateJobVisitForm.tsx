import { useEffect, useMemo, useState } from "react";
import { api, type ClientLite, type TechSnapshot } from "../api";

type Props = {
	techs: TechSnapshot[];
	notify: (kind: "success" | "error", text: string) => void;
};

function toLocalInput(date: Date): string {
	// "YYYY-MM-DDTHH:MM" for <input type="datetime-local">
	const pad = (n: number) => String(n).padStart(2, "0");
	return (
		`${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
		`T${pad(date.getHours())}:${pad(date.getMinutes())}`
	);
}

export function CreateJobVisitForm({ techs, notify }: Props) {
	const [clients, setClients] = useState<ClientLite[]>([]);
	const [clientId, setClientId] = useState("");
	const [address, setAddress] = useState("");
	const [lat, setLat] = useState("");
	const [lon, setLon] = useState("");
	const [visitName, setVisitName] = useState("Visit 1");
	const [description, setDescription] = useState("Simulated job");
	const [startAt, setStartAt] = useState(() => toLocalInput(new Date()));
	const [endAt, setEndAt] = useState(() =>
		toLocalInput(new Date(Date.now() + 60 * 60 * 1000)),
	);
	const [techIds, setTechIds] = useState<string[]>([]);
	const [busy, setBusy] = useState(false);

	useEffect(() => {
		api.listClients()
			.then(setClients)
			.catch((err) => notify("error", (err as Error).message));
	}, [notify]);

	const selectedClient = useMemo(
		() => clients.find((c) => c.id === clientId),
		[clients, clientId],
	);

	useEffect(() => {
		if (!selectedClient) return;
		setAddress(selectedClient.address);
		if (selectedClient.coords) {
			setLat(String(selectedClient.coords.lat));
			setLon(String(selectedClient.coords.lon));
		}
	}, [selectedClient]);

	async function submit(e: React.FormEvent) {
		e.preventDefault();
		if (!clientId || !address || !lat || !lon) return;
		setBusy(true);
		try {
			await api.createJobWithVisit({
				client_id: clientId,
				address: address.trim(),
				coords: { lat: Number(lat), lon: Number(lon) },
				visit_name: visitName || "Visit 1",
				description: description.trim() || undefined,
				scheduled_start_at: new Date(startAt).toISOString(),
				scheduled_end_at: new Date(endAt).toISOString(),
				tech_ids: techIds,
			});
			notify("success", "Job + visit created");
		} catch (err) {
			notify("error", (err as Error).message);
		} finally {
			setBusy(false);
		}
	}

	return (
		<form className="sim-form" onSubmit={submit}>
			<label>
				Client
				<select
					value={clientId}
					onChange={(e) => setClientId(e.target.value)}
				>
					<option value="">-- select --</option>
					{clients.map((c) => (
						<option key={c.id} value={c.id}>
							{c.name}
						</option>
					))}
				</select>
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
			<label>
				Visit name
				<input
					value={visitName}
					onChange={(e) => setVisitName(e.target.value)}
				/>
			</label>
			<label>
				Description
				<textarea
					rows={2}
					value={description}
					onChange={(e) => setDescription(e.target.value)}
				/>
			</label>
			<div className="row">
				<label>
					Start
					<input
						type="datetime-local"
						value={startAt}
						onChange={(e) => setStartAt(e.target.value)}
					/>
				</label>
				<label>
					End
					<input
						type="datetime-local"
						value={endAt}
						onChange={(e) => setEndAt(e.target.value)}
					/>
				</label>
			</div>
			<label>
				Technicians (ctrl/cmd-click to multi-select)
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
			<button className="primary" type="submit" disabled={busy}>
				{busy ? "Creating…" : "Create Job + Visit"}
			</button>
		</form>
	);
}
