import type { JSX } from "react";
import { createPortal } from "react-dom";

interface FullPopupProps {
	content: JSX.Element;
	isModalOpen: boolean;
	onClose: () => void;
	size?: "md" | "lg" | "xl";
	hasBackground?: boolean;
	overflowVisible?: boolean;
}

const FullPopup = ({
	content,
	isModalOpen,
	size = "md",
	hasBackground = true,
	overflowVisible = false,
}: FullPopupProps) => {
	const backdropClass =
		"transition-opacity duration-300 fixed inset-0 z-[4000] bg-black " +
		(isModalOpen ? "opacity-50 pointer-events-auto" : "opacity-0 pointer-events-none");

	const panelClass =
		"fixed inset-0 z-[5000] flex items-center justify-center max-h-screen " +
		(isModalOpen ? "pointer-events-auto" : "pointer-events-none");

	let insetClass =
		"scrollbar-hide bg-surface border border-border-card rounded-lg shadow-xl max-h-[92vh] min-h-0 text-text-primary flex flex-col ";

	insetClass += overflowVisible ? "overflow-visible " : "overflow-hidden ";

	switch (size) {
		case "md":
			insetClass += "w-[calc(100%-2rem)] sm:w-[clamp(600px,55vw,640px)]";
			break;
		case "lg":
			insetClass += "w-[calc(100%-2rem)] sm:w-[clamp(800px,75vw,1000px)]";
			break;
		case "xl":
			insetClass += "w-[calc(100%-2rem)] sm:w-[clamp(900px,85vw,1400px)]";
			break;
	}

	if (!isModalOpen) {
		return (
			<>
				{hasBackground && <div className={backdropClass} />}
				<div className={panelClass} />
			</>
		);
	}

	return createPortal(
		<>
			{hasBackground && <div className={backdropClass} />}
			<div className={panelClass}>
				<div className={insetClass}>{content}</div>
			</div>
		</>,
		document.body
	);
};

export default FullPopup;
