import { db } from "../db.js";
import { getScopedDb } from "../lib/context.js";
import type { email_template_category } from "../../generated/prisma/client.js";
import type { UpsertTemplateInput } from "../lib/validate/emailTemplates.js";
import { getOrgBrand } from "../services/emailBranding.js";
import {
	listEffectiveTemplates,
	type EffectiveTemplate,
} from "../services/followupTemplates.js";
import { DEFAULT_TEMPLATES } from "../services/followupTemplateDefaults.js";

const notFound = (message: string) => Object.assign(new Error(message), { status: 404 });

/** All templates for the org (saved overrides merged over built-in defaults). */
export async function listTemplates(orgId: string): Promise<EffectiveTemplate[]> {
	return listEffectiveTemplates(orgId);
}

/** A single category's effective template. */
export async function getTemplate(
	orgId: string,
	category: email_template_category,
): Promise<EffectiveTemplate> {
	const all = await listEffectiveTemplates(orgId);
	const found = all.find((t) => t.category === category);
	if (!found) throw notFound("Template not found");
	return found;
}

/** Create or update an org's template for a category. */
export async function upsertTemplate(
	orgId: string,
	category: email_template_category,
	input: UpsertTemplateInput,
	dispatcherId: string | null,
): Promise<EffectiveTemplate> {
	const name = input.name?.trim() || DEFAULT_TEMPLATES[category].name;
	// Blank plain-text → null so the send path auto-generates it from the HTML.
	const text = input.text && input.text.trim() ? input.text : null;
	const row = await db.email_template.upsert({
		where: { organization_id_category: { organization_id: orgId, category } },
		update: {
			name,
			subject: input.subject,
			html: input.html,
			text,
			updated_by_dispatcher_id: dispatcherId,
		},
		create: {
			organization_id: orgId,
			category,
			name,
			subject: input.subject,
			html: input.html,
			text,
			updated_by_dispatcher_id: dispatcherId,
		},
	});
	return {
		category,
		name: row.name,
		subject: row.subject,
		html: row.html,
		text: row.text,
		is_customized: true,
		updated_at: row.updated_at,
	};
}

/** Discard an org's override, reverting the category to its built-in default. */
export async function resetTemplate(
	orgId: string,
	category: email_template_category,
): Promise<EffectiveTemplate> {
	await db.email_template.deleteMany({ where: { organization_id: orgId, category } });
	const def = DEFAULT_TEMPLATES[category];
	return {
		category,
		name: def.name,
		subject: def.subject,
		html: def.html,
		text: def.text,
		is_customized: false,
		updated_at: null,
	};
}

/**
 * Prefill values for the editor's live preview: the org's real branding (logo
 * signed for email use) plus sample content variables. Mirrors the shape of the
 * send-time template model so the preview matches what a client will receive.
 */
export async function getPreviewContext(orgId: string): Promise<{
	brand: Awaited<ReturnType<typeof getOrgBrand>>;
	samples: { client_name: string; anchor_type: string | null };
}> {
	const sdb = getScopedDb(orgId);
	const [brand, client] = await Promise.all([
		getOrgBrand(orgId),
		sdb.client.findFirst({ select: { name: true } }),
	]);
	return {
		brand,
		samples: {
			client_name: client?.name ?? "Alex Johnson",
			anchor_type: null,
		},
	};
}
