import { useState } from "react";
import { Ban, Check, ChevronRight, Loader2, TriangleAlert } from "lucide-react";
import type { UiToolCall } from "../../types/assistant";

/**
 * One tool call, rendered as it happens.
 *
 * Showing the work is the point: a dispatcher should never have to wonder what
 * the assistant looked at to reach an answer. The summary is the headline; the
 * raw arguments are one click away for when the answer looks wrong.
 */
export default function ToolCallCard({ call }: { call: UiToolCall }) {
	const [open, setOpen] = useState(false);

	const label = call.summary ?? humanise(call.name);
	const failed = call.state === "error";
	const declined = call.state === "declined";

	return (
		<div
			className={`rounded-md border text-xs ${
				failed ? "border-error-border bg-error-bg" : "border-border-subtle bg-surface-inset"
			}`}
		>
			<button
				type="button"
				onClick={() => setOpen((v) => !v)}
				aria-expanded={open}
				className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left"
			>
				<span className="shrink-0">
					{call.state === "running" ? (
						<Loader2 size={13} className="animate-spin text-text-muted" />
					) : declined ? (
						<Ban size={13} className="text-text-muted" />
					) : failed ? (
						<TriangleAlert size={13} className="text-error-text" />
					) : (
						<Check size={13} className="text-success-text" />
					)}
				</span>
				<span className={`flex-1 truncate ${failed ? "text-error-text" : "text-text-secondary"}`}>
					{declined ? `Declined — ${label}` : label}
				</span>
				{call.durationMs !== undefined && (
					<span className="shrink-0 tabular-nums text-faint">{formatDuration(call.durationMs)}</span>
				)}
				<ChevronRight
					size={13}
					className={`shrink-0 text-faint transition-transform ${open ? "rotate-90" : ""}`}
				/>
			</button>

			{open && (
				<div className="border-t border-border-subtle px-2.5 py-2">
					<div className="font-mono text-[11px] text-text-muted">{call.name}</div>
					<pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap break-words font-mono text-[11px] text-text-muted">
						{JSON.stringify(call.input ?? {}, null, 2)}
					</pre>
					{call.errorMessage && <div className="mt-1 text-[11px] text-error-text">{call.errorMessage}</div>}
				</div>
			)}
		</div>
	);
}

/** `get_technician_availability` → "Get technician availability" */
function humanise(name: string): string {
	const words = name.replace(/_/g, " ");
	return words.charAt(0).toUpperCase() + words.slice(1);
}

const formatDuration = (ms: number): string => (ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`);
