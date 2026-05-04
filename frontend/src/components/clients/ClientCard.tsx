import { MapPin, Clock } from "lucide-react";
import type { Client } from "../../types/clients";

interface ClientCardProps {
	client: Client;
	onClick?: () => void;
	viewMode?: "card" | "list";
}

function capitalizeWords(str: string) {
	return str
		.toLowerCase()
		.replace(/\b\w/g, (char) => char.toUpperCase());
}

function formatLastActivity(raw: unknown) {
	if (!raw) return "No recent activity";

	let d: Date;

	if (raw instanceof Date) {
		d = raw;
	} else if (typeof raw === "string") {
		d = new Date(raw);
	} else {
		d = new Date(String(raw));
	}

	if (isNaN(d.getTime())) {
		return "No recent activity";
	}

	return d.toLocaleString(undefined, {
		month: "short",
		day: "numeric",
		hour: "numeric",
		minute: "2-digit",
	});
}

export default function ClientCard({ client, onClick, viewMode = "card" }: ClientCardProps) {
	const displayName = capitalizeWords(client.name);
	const lastActivityText = formatLastActivity(client.last_activity);
	const jobsCount = client.jobs?.length ?? 0;

	if (viewMode === "list") {
		return (
			<div
				className="flex items-center gap-4 w-full px-4 py-3 bg-zinc-900 border border-[#3a3a3f] rounded-lg hover:border-zinc-500 cursor-pointer transition-all"
				onClick={onClick}
			>
				<div
					className={`shrink-0 w-2 h-2 rounded-full ${
						client.is_active ? "bg-green-400" : "bg-zinc-600"
					}`}
				/>

				<h3 className="text-white font-semibold text-sm shrink-0">
					{displayName}
				</h3>

				<div className="flex items-center gap-1.5 text-sm text-zinc-400 flex-1 min-w-0">
					<MapPin size={14} className="shrink-0" />
					<span className="truncate">{client.address || "No address provided"}</span>
				</div>

				<div className="shrink-0 flex items-center gap-4 text-xs text-zinc-500">
					<span>Jobs: <span className="text-zinc-300">{jobsCount}</span></span>
					<div className="flex items-center gap-1">
						<Clock size={12} />
						<span>{lastActivityText}</span>
					</div>
				</div>
			</div>
		);
	}

	return (
		<div
			className="
				bg-zinc-900 border border-[#3a3a3f] rounded-lg p-4
				hover:border-zinc-500 hover:shadow-lg transition-all cursor-pointer
				w-60 h-40 flex flex-col justify-between
			"
			onClick={onClick}
		>
			<div className="flex-1 min-h-0">
				<h3
					className="
						text-white font-semibold text-lg mb-2
						overflow-hidden text-ellipsis whitespace-nowrap"
				>
					{displayName}
				</h3>

				<div className="flex items-start gap-2 text-sm text-zinc-400">
					<MapPin size={16} className="mt-0.5 flex-shrink-0" />
					<span className="overflow-hidden text-ellipsis whitespace-nowrap">
						{client.address || "No address provided"}
					</span>
				</div>

				<p className="mt-1 text-xs text-zinc-500">
					Jobs: <span className="text-zinc-300">{jobsCount}</span>
				</p>
			</div>

			<div className="w-full h-px bg-zinc-800 mb-2" />

			<div className="flex items-center justify-between">
				<span
					className={`
						inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium
						${
							client.is_active
								? "bg-green-500/10 text-green-400 border border-green-500/20"
								: "bg-zinc-800 text-zinc-400 border border-zinc-700"
						}
					`}
				>
					{client.is_active ? "Active" : "Inactive"}
				</span>

				<div className="flex items-center text-xs text-zinc-400">
					<Clock size={13} className="mr-1 opacity-70" />
					{lastActivityText}
				</div>
			</div>
		</div>
	);
}
