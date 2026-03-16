import { FormDraftType } from "../lib/validate/drafts.js";

//Gets a display label from the draft payload at save time.
export function deriveDraftLabel(
	formType: FormDraftType,
	payload: Record<string, unknown>,
): string {
	const fallbackDate = new Date().toLocaleString("en-US", {
		month: "short",
		day: "numeric",
		hour: "numeric",
		minute: "2-digit",
	});

	switch (formType) {
		case "request": {
			const title = stringOrNull(payload["title"]);
			const clientName = resolveClientName(payload);
			return title ?? clientName ?? `Request — ${fallbackDate}`;
		}
		case "quote": {
			const title = stringOrNull(payload["title"]);
			const clientName = resolveClientName(payload);
			return title ?? clientName ?? `Quote — ${fallbackDate}`;
		}
		case "job": {
			const name = stringOrNull(payload["name"]);
			const clientName = resolveClientName(payload);
			return name ?? clientName ?? `Job — ${fallbackDate}`;
		}
		case "job_visit": {
			const name = stringOrNull(payload["name"]);
			// No client concept on visits — use name or timestamp only
			return name ?? `Visit Draft — ${fallbackDate}`;
		}
		case "recurring_plan": {
			const name = stringOrNull(payload["name"]);
			const clientName = resolveClientName(payload);
			return name ?? clientName ?? `Recurring Plan — ${fallbackDate}`;
		}
		default:
			return `Draft — ${fallbackDate}`;
	}
}

function stringOrNull(val: unknown): string | null {
	if (typeof val === "string" && val.trim().length > 0) {
		return val.trim();
	}
	return null;
}

function resolveClientName(payload: Record<string, unknown>): string | null {
	const flat = stringOrNull(payload["client_name"]);
	if (flat) return flat;

	const clientObj = payload["client"];
	if (
		clientObj &&
		typeof clientObj === "object" &&
		!Array.isArray(clientObj)
	) {
		return stringOrNull((clientObj as Record<string, unknown>)["name"]);
	}

	return null;
}
