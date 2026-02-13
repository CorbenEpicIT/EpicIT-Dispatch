import type { JSX } from "react";
import { createPortal } from "react-dom";

interface FullPopupProps {
	content: JSX.Element;
	isModalOpen: boolean;
	onClose: () => void;
	size?: "md" | "lg" | "xl";
	hasBackground?: boolean;
}

const FullPopup = ({
	content,
	isModalOpen,
	onClose,
	size = "md",
	hasBackground = true,
}: FullPopupProps) => {
	let baseClassPanel =
		"transition-all duration-300 fixed inset-0 z-[5000] flex items-center justify-center ";
	let baseClassBackground = "transition-all duration-300 fixed inset-0 z-[4000] bg-black ";

	if (isModalOpen) {
		baseClassPanel += "opacity-100 pointer-events-auto";
		baseClassBackground += "opacity-50 pointer-events-auto";
	} else {
		baseClassPanel += "opacity-0 pointer-events-none";
		baseClassBackground += "opacity-0 pointer-events-none";
	}

	let baseClassInset =
		"scrollbar-hide transition-all duration-300 bg-zinc-900 p-5 rounded-lg shadow-xl max-h-[90vh] overflow-y-auto text-white ";

	switch (size) {
		case "md":
			baseClassInset += "w-[calc(100%-2rem)] sm:w-[clamp(600px,55vw,640px)]";
			break;
		case "lg":
			baseClassInset += "w-[calc(100%-2rem)] sm:w-[clamp(800px,75vw,1000px)]";
			break;
		case "xl":
			baseClassInset += "w-[calc(100%-2rem)] sm:w-[clamp(900px,85vw,1400px)]";
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
				{hasBackground && <div className={baseClassBackground} />}
				<div className={baseClassPanel}></div>
			</>
		);
	}

	return createPortal(
		<>
			{hasBackground && (
				<div className={baseClassBackground} onMouseDown={onClose} />
			)}

			<div className={baseClassPanel} onMouseDown={handlePanelMouseDown}>
				<div
					className={baseClassInset}
					onMouseDown={(e) => e.stopPropagation()}
				>
					{content}
				</div>
				<style>{`
          .scrollbar-hide::-webkit-scrollbar {
            display: none;
          }
          .scrollbar-hide {
            -ms-overflow-style: none;
            scrollbar-width: none;
          }
        `}</style>
			</div>
		</>,
		document.body
	);
};

export default FullPopup;
