import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { QrCode } from "lucide-react";
import { useLabelQueueStore } from "../../../stores/labelQueueStore";
import { useToast } from "../../ui/useToast";

// Silent watcher, not a rendered stack — "Add to Label Queue" buttons push to
// labelQueueStore without navigating (so dispatchers can queue many items
// before printing), and without feedback the click looks like a no-op. This
// watches lastAddSeq (bumped on every add, even upserts) and pushes a
// confirmation into the shared toastStore/ToastViewport with a shortcut into
// the print page, instead of rendering its own fixed-position toast.
export default function LabelQueueToast() {
	const navigate = useNavigate();
	const toast = useToast();
	const lastAddSeq = useLabelQueueStore((s) => s.lastAddSeq);
	const lastAddLabel = useLabelQueueStore((s) => s.lastAddLabel);
	// Skip the initial mount — lastAddSeq starts at 0 and we only want to react
	// to genuine adds that happen while this component is mounted.
	const seenSeq = useRef(lastAddSeq);

	useEffect(() => {
		if (lastAddSeq === seenSeq.current) return;
		seenSeq.current = lastAddSeq;
		const count = useLabelQueueStore.getState().items.length;
		toast.info(
			<>
				<span className="font-medium text-text-primary">
					{lastAddLabel
						? `Added "${lastAddLabel}"`
						: "Added to label queue"}
				</span>
				<span className="text-text-muted"> · {count} queued</span>
			</>,
			{
				icon: <QrCode size={16} className="text-primary shrink-0 mt-0.5" />,
				durationMs: 5000,
				action: {
					label: "View",
					onClick: () => navigate("/dispatch/inventory/labels/print"),
				},
			}
		);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [lastAddSeq, lastAddLabel]);

	return null;
}
