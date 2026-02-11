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

	// CSS injection for dropdown positioning
	useEffect(() => {
		const styleId = `geocoder-position-${dropdownPosition}`;
		const existingStyle = document.getElementById(styleId);

		if (existingStyle) {
			existingStyle.remove();
		}

		const style = document.createElement("style");
		style.id = styleId;
		style.setAttribute("data-dropdown-position", dropdownPosition);

		if (dropdownPosition === "above") {
			style.textContent = `
				/* Ensure geocoder container establishes positioning context */
				.mapboxgl-ctrl-geocoder {
					position: relative !important;
					overflow: visible !important;
				}
				
				/* The wrapper needs to be positioned above without clipping */
				.mapboxgl-ctrl-geocoder .suggestions-wrapper,
				.mapboxgl-ctrl-geocoder > .suggestions-wrapper {
					position: absolute !important;
					bottom: calc(100% + 4px) !important;
					top: auto !important;
					left: 0 !important;
					right: 0 !important;
					margin: 0 !important;
					box-shadow: 0 -4px 12px rgba(0, 0, 0, 0.3) !important;
					z-index: 9999 !important;
					max-height: 300px !important;
					display: flex !important;
					flex-direction: column !important;
				}

				/* The suggestions list itself needs proper flex behavior */
				.mapboxgl-ctrl-geocoder .suggestions,
				.suggestions-wrapper .suggestions,
				.mapboxgl-ctrl-geocoder--suggestions {
					position: relative !important;
					flex: 1 !important;
					max-height: 250px !important;
					overflow-y: auto !important;
					display: block !important;
				}

				/* Ensure individual suggestion items are visible */
				.mapboxgl-ctrl-geocoder .suggestions li,
				.mapboxgl-ctrl-geocoder--suggestions li {
					display: block !important;
					visibility: visible !important;
					opacity: 1 !important;
				}

				/* Powered by text at bottom */
				.mapboxgl-ctrl-geocoder .mapboxgl-ctrl-geocoder--powered-by,
				.suggestions-wrapper .mapboxgl-ctrl-geocoder--powered-by {
					position: relative !important;
					bottom: auto !important;
					top: auto !important;
					order: 999 !important;
					flex-shrink: 0 !important;
				}
			`;
		} else {
			style.textContent = `
				.mapboxgl-ctrl-geocoder {
					overflow: visible !important;
				}
				.mapboxgl-ctrl-geocoder .suggestions-wrapper {
					position: absolute !important;
					top: calc(100% + 4px) !important;
					bottom: auto !important;
					box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3) !important;
					z-index: 9999 !important;
				}
			`;
		}

		document.head.appendChild(style);

		return () => {
			style.remove();
		};
	}, [dropdownPosition]);

	// MutationObserver to handle dynamically rendered content
	useEffect(() => {
		const observer = new MutationObserver((mutations) => {
			mutations.forEach((mutation) => {
				mutation.addedNodes.forEach((node) => {
					if (node instanceof HTMLElement) {
						const isDropdown =
							node.classList?.contains(
								"suggestions-wrapper"
							) ||
							node.classList?.contains("suggestions") ||
							node.getAttribute?.("role") === "listbox";

						if (isDropdown && dropdownPosition === "above") {
							node.style.setProperty(
								"position",
								"absolute",
								"important"
							);
							node.style.setProperty(
								"bottom",
								"calc(100% + 4px)",
								"important"
							);
							node.style.setProperty(
								"top",
								"auto",
								"important"
							);
							node.style.setProperty(
								"z-index",
								"9999",
								"important"
							);

							const suggestionsList =
								node.querySelector?.(
									".suggestions, .mapboxgl-ctrl-geocoder--suggestions"
								);
							if (
								suggestionsList &&
								suggestionsList instanceof
									HTMLElement
							) {
								suggestionsList.style.setProperty(
									"max-height",
									"250px",
									"important"
								);
								suggestionsList.style.setProperty(
									"overflow-y",
									"auto",
									"important"
								);
								suggestionsList.style.setProperty(
									"display",
									"block",
									"important"
								);
							}
						}
					}
				});
			});
		});

		observer.observe(document.body, {
			childList: true,
			subtree: true,
		});

		return () => observer.disconnect();
	}, [dropdownPosition]);

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
		cssText:
			dropdownPosition === "above"
				? `
			input {
				color: #ffffff !important;
			}
			.mapboxgl-ctrl-geocoder--input {
				background: transparent !important;
			}
			.suggestions-wrapper {
				position: absolute !important;
				bottom: calc(100% + 4px) !important;
				top: auto !important;
				max-height: 300px !important;
				display: flex !important;
				flex-direction: column !important;
			}
			.suggestions {
				flex: 1 !important;
				max-height: 250px !important;
				overflow-y: auto !important;
			}
		`
				: `
			input {
				color: #ffffff !important;
			}
			.mapboxgl-ctrl-geocoder--input {
				background: transparent !important;
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
				{
					name: "flip",
					enabled: false,
				},
				{
					name: "preventOverflow",
					enabled: true,
					options: {
						altAxis: true,
						tether: false,
						padding: 8,
					},
				},
				{
					name: "offset",
					enabled: true,
					options: {
						offset: [0, 4],
					},
				},
			],
		}),
		[dropdownPosition]
	);

	const commitSelection = (address: string, coords: { lat: number; lon: number }) => {
		lastCommittedAddress.current = address;
		setInputValue(address);
		handleChange({
			address,
			coords,
		} as GeocodeResult);
	};

	const onEditUndo = () => {
		if (!originalValue.trim() || !originalCoords) {
			setInputValue(originalValue || "");
			handleClear?.();
			return;
		}
		commitSelection(originalValue, originalCoords);
	};

	const handleInputChange = (value: string) => {
		setInputValue(value);
	};

	return (
		<div
			ref={geocoderRef}
			className={`w-full relative overflow-visible ${isEdit ? "edit-mode-geocoder" : ""} ${
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
				onChange={handleInputChange}
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
