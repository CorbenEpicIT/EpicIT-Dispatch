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
	onClose,
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
		"scrollbar-hide bg-zinc-900 rounded-lg shadow-xl max-h-[92vh] min-h-0 text-white flex flex-col ";

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

	const handlePanelMouseDown = (e: React.MouseEvent) => {
		const target = e.target as HTMLElement;
		const isMapboxElement =
			target.closest(".mapboxgl-ctrl-geocoder") ||
			target.closest(".suggestions-wrapper") ||
			target.closest(".mapbox-gl-geocoder") ||
			target.classList.contains("mapboxgl-ctrl-geocoder--suggestion");

		if (!isMapboxElement) {
			onClose();
		}
	};

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
			{hasBackground && <div className={backdropClass} onMouseDown={onClose} />}
			<div className={panelClass} onMouseDown={handlePanelMouseDown}>
				<div
					className={insetClass}
					onMouseDown={(e) => e.stopPropagation()}
				>
					{content}
				</div>
			</div>
			<style>{`
				.scrollbar-hide::-webkit-scrollbar { display: none; }
				.scrollbar-hide { -ms-overflow-style: none; scrollbar-width: none; }
			`}</style>
		</>,
		document.body
	);
};

export default FullPopup;
