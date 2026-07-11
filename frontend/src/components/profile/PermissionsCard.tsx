import { groupPermissionsByCategory } from "../../lib/permissionCatalogs";

interface PermissionsCardProps {
	permissionIds: string[];
	tier: "dispatcher" | "technician";
}

export default function PermissionsCard({ permissionIds, tier }: PermissionsCardProps) {
	const permissionGroups = groupPermissionsByCategory(permissionIds, tier);

	return (
		<section>
			{permissionGroups.length === 0 ? (
				<p className="text-sm text-text-muted">No permissions assigned.</p>
			) : (
				<div className="space-y-2">
					{permissionGroups.map(({ category, permissions }) => (
						<div key={category} className="rounded-lg border border-border-subtle bg-surface px-4 py-3">
							<p className="text-xs font-medium text-text-muted uppercase tracking-wide mb-2">
								{category}
							</p>
							<div className="flex flex-wrap gap-1.5">
								{permissions.map((p) => (
									<span
										key={p.id}
										className="px-2 py-0.5 rounded-md bg-surface text-xs text-text-secondary border border-border-subtle"
									>
										{p.label}
									</span>
								))}
							</div>
						</div>
					))}
				</div>
			)}
		</section>
	);
}
