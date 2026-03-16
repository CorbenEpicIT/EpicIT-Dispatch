import { useRef, useState, useEffect } from "react";
import FullPopup from "../ui/FullPopup";
import { type CreateQuoteInput } from "../../types/quotes";
import { PriorityValues } from "../../types/common";
import type { Request } from "../../types/requests";
import type { GeocodeResult } from "../../types/location";
import Dropdown from "../ui/Dropdown";
import AddressForm from "../ui/AddressForm";

interface ConvertToQuoteProps {
	isModalOpen: boolean;
	setIsModalOpen: (open: boolean) => void;
	request: Request;
	onConvert: (quoteData: CreateQuoteInput) => Promise<string>;
}

export default function ConvertToQuote({
	isModalOpen,
	setIsModalOpen,
	request,
	onConvert,
}: ConvertToQuoteProps) {
	const titleRef = useRef<HTMLInputElement>(null);
	const descRef = useRef<HTMLTextAreaElement>(null);
	const priorityRef = useRef<HTMLSelectElement>(null);
	const validUntilRef = useRef<HTMLInputElement>(null);
	const expiresAtRef = useRef<HTMLInputElement>(null);
	const [geoData, setGeoData] = useState<GeocodeResult | undefined>(
		request.address || request.coords
			? { address: request.address || "", coords: request.coords }
			: undefined
	);
	const [isLoading, setIsLoading] = useState(false);
	const [titleError, setTitleError] = useState<string | null>(null);

	useEffect(() => {
		if (isModalOpen && priorityRef.current) {
			priorityRef.current.value = "Medium";
		}
	}, [isModalOpen]);

	const handleChangeAddress = (result: GeocodeResult) => {
		setGeoData({ address: result.address, coords: result.coords });
	};

	const handleClearAddress = () => {
		if (request.address || request.coords) {
			setGeoData({ address: request.address || "", coords: request.coords });
		} else {
			setGeoData(undefined);
		}
	};

	const priorityEntries = (
		<>
			{PriorityValues.map((v) => (
				<option key={v} value={v} className="text-black">
					{v}
				</option>
			))}
		</>
	);

	const invokeConvert = async () => {
		if (titleRef.current && descRef.current && priorityRef.current && !isLoading) {
			const titleValue = titleRef.current.value.trim();
			const descValue = descRef.current.value.trim();
			const priorityValue = priorityRef.current.value.trim() as
				| "Low"
				| "Medium"
				| "High";
			const validUntilValue = validUntilRef.current?.value || undefined;
			const expiresAtValue = expiresAtRef.current?.value || undefined;

			setTitleError(null);
			if (!titleValue) {
				setTitleError("Quote title is required");
				return;
			}

			setIsLoading(true);
			try {
				const quoteData: CreateQuoteInput = {
					client_id: request.client_id,
					request_id: request.id,
					title: titleValue,
					description: descValue,
					address: geoData?.address || "",
					coords: geoData?.coords,
					priority: priorityValue,
					status: "Draft",
					subtotal: 0,
					tax_rate: 0,
					tax_amount: 0,
					discount_amount: 0,
					total: 0,
					valid_until: validUntilValue
						? new Date(validUntilValue).toISOString()
						: undefined,
					expires_at: expiresAtValue
						? new Date(expiresAtValue).toISOString()
						: undefined,
					line_items: [],
				};

				await onConvert(quoteData);

				if (titleRef.current) titleRef.current.value = "";
				if (descRef.current) descRef.current.value = "";
				if (validUntilRef.current) validUntilRef.current.value = "";
				if (expiresAtRef.current) expiresAtRef.current.value = "";
				setGeoData(undefined);
				setTitleError(null);
				setIsModalOpen(false);
			} catch (error) {
				console.error("Failed to convert request to quote:", error);
				setTitleError(
					error instanceof Error
						? error.message
						: "Failed to convert request to quote"
				);
			} finally {
				setIsLoading(false);
			}
		}
	};

	const content = (
		<div className="flex flex-col min-h-0 flex-1">
			{/* Header */}
			<div className="flex items-center justify-between px-4 lg:px-6 py-3 lg:py-4 border-b border-zinc-800 flex-shrink-0">
				<h2 className="text-lg lg:text-xl font-bold text-white">
					Convert to Quote
				</h2>
			</div>

			{/* Scrollable body */}
			<div className="flex-1 overflow-y-auto px-4 lg:px-6 py-4 lg:py-5 space-y-3 lg:space-y-4">
				{/* Title */}
				<div>
					<label className="block mb-0.5 lg:mb-1 text-xs font-medium text-zinc-400 uppercase tracking-wider">
						Quote Title *
					</label>
					<input
						type="text"
						placeholder="Quote Title"
						className="border border-zinc-700 px-2.5 py-1.5 lg:py-2 w-full rounded bg-zinc-900 text-white text-sm lg:text-base focus:border-blue-500 focus:outline-none transition-colors"
						disabled={isLoading}
						ref={titleRef}
						defaultValue={request.title}
						onChange={() => setTitleError(null)}
					/>
					{titleError && (
						<p className="text-red-400 text-xs mt-0.5">
							{titleError}
						</p>
					)}
				</div>

				{/* Description */}
				<div>
					<label className="block mb-0.5 lg:mb-1 text-xs font-medium text-zinc-400 uppercase tracking-wider">
						Description
					</label>
					<textarea
						placeholder="Quote Description"
						className="border border-zinc-700 px-2.5 py-1.5 lg:py-2 w-full h-20 lg:h-24 rounded bg-zinc-900 text-white text-sm lg:text-base resize-none focus:border-blue-500 focus:outline-none transition-colors"
						disabled={isLoading}
						ref={descRef}
						defaultValue={request.description}
					/>
				</div>

				{/* Address */}
				<div className="relative" style={{ zIndex: 50 }}>
					<label className="block mb-0.5 lg:mb-1 text-xs font-medium text-zinc-400 uppercase tracking-wider">
						Property Address
					</label>
					<AddressForm
						mode={request.address ? "edit" : "create"}
						originalValue={request.address || ""}
						originalCoords={request.coords}
						dropdownPosition="above"
						handleChange={handleChangeAddress}
						handleClear={handleClearAddress}
					/>
				</div>

				{/* Priority */}
				<div>
					<label className="block mb-0.5 lg:mb-1 text-xs font-medium text-zinc-400 uppercase tracking-wider">
						Priority
					</label>
					<Dropdown
						refToApply={priorityRef}
						entries={priorityEntries}
					/>
				</div>

				{/* Valid Until / Expires At */}
				<div className="grid grid-cols-2 gap-2 lg:gap-3">
					<div>
						<label className="block mb-0.5 lg:mb-1 text-xs font-medium text-zinc-400 uppercase tracking-wider">
							Valid Until
						</label>
						<input
							type="date"
							className="border border-zinc-700 px-2.5 py-1.5 lg:py-2 w-full rounded bg-zinc-900 text-white text-sm lg:text-base focus:border-blue-500 focus:outline-none transition-colors"
							disabled={isLoading}
							ref={validUntilRef}
						/>
					</div>
					<div>
						<label className="block mb-0.5 lg:mb-1 text-xs font-medium text-zinc-400 uppercase tracking-wider">
							Expires At
						</label>
						<input
							type="date"
							className="border border-zinc-700 px-2.5 py-1.5 lg:py-2 w-full rounded bg-zinc-900 text-white text-sm lg:text-base focus:border-blue-500 focus:outline-none transition-colors"
							disabled={isLoading}
							ref={expiresAtRef}
						/>
					</div>
				</div>

				{/* Note */}
				<div className="p-3 bg-amber-900/20 border border-amber-700/50 rounded-md">
					<p className="text-xs text-amber-200">
						Note: The quote will be created with no line items.
						You can add pricing details after creation.
					</p>
				</div>
			</div>

			{/* Footer */}
			<div className="flex items-center justify-end gap-2 px-4 lg:px-6 py-3 lg:py-4 border-t border-zinc-800 flex-shrink-0">
				<button
					onClick={() => setIsModalOpen(false)}
					disabled={isLoading}
					className="px-4 py-2 text-sm font-medium text-zinc-300 hover:text-white hover:bg-zinc-800 rounded-md border border-zinc-700 transition-colors disabled:opacity-50"
				>
					Cancel
				</button>
				<button
					onClick={invokeConvert}
					disabled={isLoading}
					className="px-4 py-2 text-sm font-medium bg-blue-600 hover:bg-blue-700 text-white rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
				>
					{isLoading ? "Creating..." : "Create Quote"}
				</button>
			</div>
		</div>
	);

	return (
		<FullPopup
			content={content}
			isModalOpen={isModalOpen}
			onClose={() => !isLoading && setIsModalOpen(false)}
		/>
	);
}
