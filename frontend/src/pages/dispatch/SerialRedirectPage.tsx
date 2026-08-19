import { Navigate, useParams } from "react-router-dom";
import { useSerialHistoryQuery } from "../../hooks/useTracking";

// Serial detail is a drawer on the item page (SerialDetailDrawer), so this
// route exists only to redirect old/external links to it. The item id isn't
// in the URL, so it's resolved from the unit itself — the same request the
// drawer makes, so TanStack Query serves the destination page from cache.
export default function SerialRedirectPage() {
	const { serialId } = useParams<{ serialId: string }>();
	const { data, isLoading, isError } = useSerialHistoryQuery(serialId ?? "");

	if (isLoading) {
		return (
			<div className="space-y-4 animate-pulse">
				<div className="h-6 w-48 bg-surface-raised rounded" />
				<div className="h-32 bg-surface-raised rounded-xl" />
				<div className="h-64 bg-surface-raised rounded-xl" />
			</div>
		);
	}

	// A missing unit can't name an item to redirect to. Say so here rather than
	// bouncing to an item page that would render its own unrelated "not found".
	if (isError || !data?.serial) {
		return (
			<div className="flex flex-col items-center justify-center h-64 gap-3">
				<div className="text-text-primary text-lg">Serial unit not found</div>
			</div>
		);
	}

	return (
		<Navigate
			to={`/dispatch/inventory/items/${data.serial.item.id}?tab=tracking&serial=${serialId}`}
			replace
		/>
	);
}
