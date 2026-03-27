import { Geocoder } from "@mapbox/search-js-react";
import type { GeocodeResult } from "../../types/location";
import { useEffect, useMemo, useRef, useState } from "react";
import { RotateCcw } from "lucide-react";

type AddressFormMode = "create" | "edit";
type DropdownPosition = "below" | "above";

interface AddressFormProps {
	handleChange: (result: GeocodeResult) => void;
	handleClear?: () => void;
	mode?: AddressFormMode;
	originalValue?: string;
	originalCoords?: { lat: number; lon: number } | undefined;
	dropdownPosition?: DropdownPosition;
}

const AddressForm = ({
	handleChange,
	handleClear,
	mode = "create",
	originalValue = "",
	originalCoords,
	dropdownPosition = "below",
}: AddressFormProps) => {
	const MAPBOX_KEY = import.meta.env.VITE_MAPBOX_TOKEN;
	if (!MAPBOX_KEY) console.error("Issue loading Mapbox public key!");

	const geocoderRef = useRef<HTMLDivElement>(null);
	const isEdit = mode === "edit";

	const [inputValue, setInputValue] = useState<string>(isEdit ? originalValue : "");
	const lastCommittedAddress = useRef<string>("");

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
		observer.observe(geocoderRef.current, { childList: true, subtree: true });
		const timer = setTimeout(hideXButton, 100);

		return () => {
			observer.disconnect();
			clearTimeout(timer);
		};
	}, [isEdit, originalValue]);

	// Handle blur to revert when empty in edit mode
	useEffect(() => {
		if (!isEdit || !geocoderRef.current) return;

		const handleFocusOut = () => {
			const container = geocoderRef.current;
			if (!container) return;
			setTimeout(() => {
				const isStillFocused = container.contains(document.activeElement);
				if (!isStillFocused && !inputValue.trim()) {
					onEditUndo();
				}
			}, 0);
		};

		const container = geocoderRef.current;
		container.addEventListener("focusout", handleFocusOut);
		return () => container.removeEventListener("focusout", handleFocusOut);
	}, [isEdit, inputValue, originalValue, originalCoords]);

	useEffect(() => {
		const styleId = "mapbox-suggestions-override";
		if (document.getElementById(styleId)) return;

		const style = document.createElement("style");
		style.id = styleId;
		style.textContent = `
			/* Suggestion list container */
			[data-seed] [role="listbox"] {
				max-height: 200px !important;
				overflow-y: auto !important;
			}

			/* Each suggestion row — single line, no wrapping */
			[data-seed] [role="option"] {
				font-size: 12px !important;
				min-height: unset !important;
				padding: 0 !important;
				overflow: hidden !important;
			}

			/* Inner div that Mapbox uses for layout — force to single truncated line */
			[data-seed] [role="option"] > div {
				display: block !important;
				padding: 5px 10px !important;
				min-height: unset !important;
				white-space: nowrap !important;
				overflow: hidden !important;
				text-overflow: ellipsis !important;
				line-height: 1.4 !important;
			}

			/* All child spans/divs inside — inline so they flow as one line */
			[data-seed] [role="option"] > div * {
				display: inline !important;
				white-space: nowrap !important;
				overflow: visible !important;
			}

			/* Hide attribution row */
			[data-seed] [aria-hidden="true"]:last-child {
				display: none !important;
			}
		`;
		document.head.appendChild(style);

		return () => {
			document.getElementById(styleId)?.remove();
		};
	}, []);

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
			border: "1px solid #505058ff",
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
			.suggestions-wrapper {
				max-height: 140px !important;
				overflow: hidden !important;
			}
			.suggestions {
				max-height: 140px !important;
				overflow-y: auto !important;
				padding: 0 !important;
				margin: 0 !important;
			}
			.suggestions > li {
				font-size: 12px !important;
				line-height: 1.3 !important;
			}
			.suggestions > li > a {
				padding: 5px 10px !important;
			}
			.mapboxgl-ctrl-geocoder--powered-by {
				display: none !important;
			}
		`,
	};

	const popoverOptions = useMemo(
		() => ({
			placement:
				dropdownPosition === "above"
					? ("top-start" as const)
					: ("bottom-start" as const),
			strategy: "absolute" as const,
			modifiers: [
				{ name: "flip", enabled: false },
				{
					name: "preventOverflow",
					enabled: true,
					options: { altAxis: true, tether: false, padding: 8 },
				},
				{
					name: "offset",
					enabled: true,
					options: { offset: [0, 0] },
				},
			],
		}),
		[dropdownPosition]
	);

	const commitSelection = (address: string, coords: { lat: number; lon: number }) => {
		lastCommittedAddress.current = address;
		setInputValue(address);
		handleChange({ address, coords } as GeocodeResult);
	};

	const onEditUndo = () => {
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
			className={`w-full relative ${isEdit ? "edit-mode-geocoder" : ""} ${
				dropdownPosition === "above" ? "geocoder-dropdown-above" : ""
			}`}
			style={{ overflow: "visible" }}
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
				popoverOptions={popoverOptions}
				onRetrieve={(d) => {
					const selectedAddress = d.properties.full_address;
					const coords = {
						lat: d.properties.coordinates.latitude,
						lon: d.properties.coordinates.longitude,
					};
					commitSelection(selectedAddress, coords);
				}}
			/>

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
