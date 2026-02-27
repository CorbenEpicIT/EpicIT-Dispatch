import { Geocoder } from "@mapbox/search-js-react";
import type { GeocodeResult } from "../../types/location";
import { useEffect, useMemo, useRef, useState } from "react";
import { RotateCcw } from "lucide-react";

type AddressFormMode = "create" | "edit";

interface AddressFormProps {
	handleChange: (result: GeocodeResult) => void;
	handleClear?: () => void;
	mode?: AddressFormMode;
	originalValue?: string;
	originalCoords?: { lat: number; lon: number } | undefined;
}

const AddressForm = ({
	handleChange,
	handleClear,
	mode = "create",
	originalValue = "",
	originalCoords,
}: AddressFormProps) => {
	const MAPBOX_KEY = import.meta.env.VITE_MAPBOX_TOKEN;
	if (!MAPBOX_KEY) console.error("Issue loading Mapbox public key!");

	const geocoderRef = useRef<HTMLDivElement>(null);
	const isEdit = mode === "edit";

	const [inputValue, setInputValue] = useState<string>(isEdit ? originalValue : "");

	// Keep in sync when opening a different record in edit mode
	useEffect(() => {
		setInputValue(isEdit ? originalValue : "");
	}, [isEdit, originalValue]);

	const isDirty = useMemo(() => {
		if (!isEdit) return false;
		return (inputValue || "").trim() !== (originalValue || "").trim();
	}, [isEdit, inputValue, originalValue]);

	// Hide Mapbox's default clear button in edit mode
	useEffect(() => {
		if (!geocoderRef.current || !isEdit) return;

		const hideXButton = () => {
			const selectors = [
				'[aria-label="Clear"]',
				".mapboxgl-ctrl-geocoder--button",
			];

			selectors.forEach((selector) => {
				const buttons = geocoderRef.current?.querySelectorAll(selector);
				buttons?.forEach((btn) => {
					const button = btn as HTMLButtonElement;
					button.style.display = "none";
					button.style.visibility = "hidden";
					button.style.opacity = "0";
					button.style.pointerEvents = "none";
				});
			});
		};

		hideXButton();

		const observer = new MutationObserver(hideXButton);
		observer.observe(geocoderRef.current, {
			childList: true,
			subtree: true,
		});

		const timer = setTimeout(hideXButton, 100);

		return () => {
			observer.disconnect();
			clearTimeout(timer);
		};
	}, [isEdit, originalValue]);

	//Handle blur to revert when empty in edit mode
	useEffect(() => {
		if (!isEdit || !geocoderRef.current) return;

		const handleFocusOut = (e: FocusEvent) => {
			const container = geocoderRef.current;
			if (!container) return;

			setTimeout(() => {
				const activeElement = document.activeElement;
				const isStillFocused = container.contains(activeElement);

				if (!isStillFocused && !inputValue.trim()) {
					onEditUndo();
				}
			}, 0);
		};

		const container = geocoderRef.current;
		container.addEventListener("focusout", handleFocusOut);

		return () => {
			container.removeEventListener("focusout", handleFocusOut);
		};
	}, [isEdit, inputValue, originalValue, originalCoords]);

	const theme = {
		variables: {
			fontFamily: "Inter",
			unit: "14px",
			lineHeight: "1.4",
			fontWeight: "400",
			fontWeightSemibold: "600",
			fontWeightBold: "700",
			minWidth: "100%",
			padding: "0.5rem 0.75rem",
			spacing: "0.25rem",
			borderRadius: "6px",
			colorBackground: "#17171aff",
			colorBackgroundHover: "#3f3f46",
			colorBackgroundActive: "#3f3f46",
			colorText: "#ffffffff",
			colorPrimary: "#3b82f6",
			colorSecondary: "#3f3f46",
			border: "1px solid #2b2b30ff",
			paddingModal: "0.5rem",
			paddingFooterLabel: "0.25rem",
		},
		cssText: `
			input {
				color: #ffffff !important;
			}
			.mapboxgl-ctrl-geocoder--input {
				background: transparent !important;
			}
		`,
	};

	const commitSelection = (address: string, coords: { lat: number; lon: number }) => {
		setInputValue(address);
		handleChange({
			address,
			coords,
		} as GeocodeResult);
	};

	const onEditUndo = () => {
		// Revert to original (or clear if original is blank / missing coords)
		if (!originalValue.trim() || !originalCoords) {
			setInputValue(originalValue || "");
			handleClear?.();
			return;
		}

		commitSelection(originalValue, originalCoords);
	};

	return (
		<div
			ref={geocoderRef}
			className={`w-full relative ${isEdit ? "edit-mode-geocoder" : ""}`}
		>
			<Geocoder
				accessToken={MAPBOX_KEY}
				options={{
					language: "en",
					country: "US",
					types: "address",
				}}
				theme={theme}
				value={inputValue}
				onChange={(value) => setInputValue(value)}
				onRetrieve={(d) => {
					const selectedAddress = d.properties.full_address;
					const coords = {
						lat: d.properties.coordinates.latitude,
						lon: d.properties.coordinates.longitude,
					};

					commitSelection(selectedAddress, coords);
				}}
			/>

			{/* Edit Mode: show Undo button when dirty */}
			{mode === "edit" && isDirty && (
				<button
					type="button"
					title="Undo changes"
					onClick={onEditUndo}
					className="absolute right-2 top-1/2 -translate-y-1/2 z-10 text-zinc-400 hover:text-white transition-colors"
				>
					<RotateCcw size={16} />
				</button>
			)}
		</div>
	);
};

export default AddressForm;
