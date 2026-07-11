import { useState } from "react";
import { usePermission } from "../../hooks/usePermission";
import {
    useQBStatusQuery,
    useQBConnectMutation,
    useQBDisconnectMutation,
} from "../../hooks/useQuickbooks";
import {
    CheckCircle2,
    XCircle,
    Loader2,
} from "lucide-react";

export default function QBConnectionCard() {
	const { data: qbStatus, isLoading } = useQBStatusQuery();
	const connectMutation = useQBConnectMutation();
	const disconnectMutation = useQBDisconnectMutation();
	const canManage = usePermission("manage_organization");
	const [disconnectError, setDisconnectError] = useState<string | null>(null);

	const handleDisconnect = async () => {
		setDisconnectError(null);
		try {
			await disconnectMutation.mutateAsync();
		} catch {
			setDisconnectError("Failed to disconnect. Please try again.");
		}
	};

	return (
		<div className="rounded-lg border border-border-subtle bg-surface px-5 py-5">
			{isLoading ? (
				<div className="h-8 w-32 animate-pulse rounded-md bg-surface" />
			) : qbStatus?.connected ? (
				<div className="flex items-center justify-between gap-4">
					<div className="flex items-center gap-2">
						<CheckCircle2 size={15} className="text-success-text flex-shrink-0" />
						<div>
							<p className="text-sm font-medium text-text-primary">Connected</p>
							{qbStatus.realmId && (
								<p className="text-xs text-text-muted">Realm ID: {qbStatus.realmId}</p>
							)}
						</div>
					</div>
					{canManage && (
						<button
							type="button"
							onClick={handleDisconnect}
							disabled={disconnectMutation.isPending}
							className="flex items-center gap-1.5 rounded-md border border-border bg-surface px-3 py-1.5 text-xs font-medium text-error-text transition-colors hover:border-error-border hover:bg-error-bg disabled:cursor-not-allowed disabled:opacity-50"
						>
							{disconnectMutation.isPending ? (
								<Loader2 size={12} className="animate-spin" />
							) : (
								<XCircle size={12} />
							)}
							{disconnectMutation.isPending ? "Disconnecting…" : "Disconnect"}
						</button>
					)}
				</div>
			) : (
				<div className="flex items-center justify-between gap-4">
					<div className="flex items-center gap-2">
						<XCircle size={15} className="text-text-muted flex-shrink-0" />
						<p className="text-sm text-text-muted">Not connected</p>
					</div>
					{canManage && (
						<button
							type="button"
							onClick={() => connectMutation.mutate()}
							disabled={connectMutation.isPending}
							className="flex items-center gap-1.5 rounded-md bg-primary-hover px-3 py-1.5 text-xs font-medium text-on-primary transition-colors hover:bg-primary disabled:cursor-not-allowed disabled:opacity-50"
						>
							{connectMutation.isPending && (
								<Loader2 size={12} className="animate-spin" />
							)}
							{connectMutation.isPending ? "Opening…" : "Connect to QuickBooks"}
						</button>
					)}
				</div>
			)}
			{disconnectError && (
				<p className="mt-2 text-xs text-error-text">{disconnectError}</p>
			)}
		</div>
	);
}    