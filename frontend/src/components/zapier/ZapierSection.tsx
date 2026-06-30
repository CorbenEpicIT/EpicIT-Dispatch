import { usePermission } from "../../hooks/usePermission";
import ZapierWorkflowEmbed from "./ZapierWorkflowEmbed";

const CLIENT_ID = import.meta.env.VITE_ZAPIER_EMBED_CLIENT_ID as string | undefined;

export default function ZapierSection() {
	const MANAGE_ORGANIZATION = usePermission("manage_organization");
	if (!MANAGE_ORGANIZATION) return null;

	// Scaffolding state until the Zapier app is published and the embed is enabled 
	if (!CLIENT_ID) {
		return (
			<div className="rounded-lg border border-dashed border-border-card bg-surface px-4 py-5 text-sm text-text-muted leading-relaxed">
				Zapier isn't enabled yet. Once the integration is turned on, you'll build
				and manage your Zaps right here.
			</div>
		);
	}

	return (
		<div className="rounded-lg border border-border-card bg-surface p-4 min-h-[420px] flex flex-col overflow-hidden">
			<ZapierWorkflowEmbed />
		</div>
	);
}
