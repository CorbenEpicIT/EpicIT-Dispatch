import { useState, useRef, useEffect } from "react";
import FullPopup from "../ui/FullPopup";
import DatePicker from "../ui/DatePicker";
import { type CreateQuoteInput } from "../../types/quotes";
import { PriorityValues } from "../../types/common";
import type { Request } from "../../types/requests";
import type { GeocodeResult } from "../../types/location";
import Dropdown from "../ui/Dropdown";
import AddressForm from "../ui/AddressForm";
import { X } from "lucide-react";

interface ConvertToQuoteProps {
	isModalOpen: boolean;
	setIsModalOpen: (open: boolean) => void;
	request: Request;
	onConvert: (quoteData: CreateQuoteInput) => Promise<string>;
}

const LABEL = "block mb-0.5 lg:mb-1 text-xs font-medium text-zinc-400 uppercase tracking-wider";
const INPUT =
	"border border-zinc-700 px-2.5 h-[34px] w-full rounded bg-zinc-900 text-white text-sm lg:text-base focus:border-blue-500 focus:outline-none transition-colors";

export default function ConvertToQuote({
	isModalOpen,
	setIsModalOpen,
	request,
	onConvert,
}: ConvertToQuoteProps) {
	const titleRef = useRef<HTMLInputElement>(null);
	const descRef = useRef<HTMLTextAreaElement>(null);
	const priorityRef = useRef<HTMLSelectElement>(null);
	const [validUntil, setValidUntil] = useState<Date | null>(null);
	const [expiresAt, setExpiresAt] = useState<Date | null>(null);
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
		if (!isModalOpen) {
			setValidUntil(null);
			setExpiresAt(null);
			setTitleError(null);
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
		if (!titleRef.current || !descRef.current || !priorityRef.current || isLoading)
			return;

		const titleValue = titleRef.current.value.trim();
		const descValue = descRef.current.value.trim();
		const priorityValue = priorityRef.current.value.trim() as "Low" | "Medium" | "High";

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
				valid_until: validUntil ? validUntil.toISOString() : undefined,
				expires_at: expiresAt ? expiresAt.toISOString() : undefined,
				line_items: [],
			};

			await onConvert(quoteData);

			if (titleRef.current) titleRef.current.value = "";
			if (descRef.current) descRef.current.value = "";
			setValidUntil(null);
			setExpiresAt(null);
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
	};

	const content = (
		<div className="flex flex-col min-h-0 flex-1">
			{/* Header */}
			<div className="flex items-center justify-between px-4 sm:px-5 pt-4 pb-3 border-b border-zinc-700 flex-shrink-0">
				<h2 className="text-lg sm:text-xl font-bold text-white whitespace-nowrap">
					Convert to Quote
				</h2>
				<button
					onClick={() => !isLoading && setIsModalOpen(false)}
					disabled={isLoading}
					className="p-1.5 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded transition-colors disabled:opacity-50"
				>
					<X size={18} />
				</button>
			</div>

			{/* Body */}
			<div className="flex-1 overflow-y-auto px-4 sm:px-5 pt-3 sm:pt-4 pb-4 space-y-4 min-h-0">
				{/* Title */}
				<div>
					<label className={LABEL}>Quote Title *</label>
					<input
						type="text"
						placeholder="Quote Title"
						className={INPUT}
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
					<label className={LABEL}>Description</label>
					<textarea
						placeholder="Quote Description"
						className="border border-zinc-700 px-2.5 py-1.5 w-full h-20 rounded bg-zinc-900 text-white text-sm resize-none focus:border-blue-500 focus:outline-none transition-colors"
						disabled={isLoading}
						ref={descRef}
						defaultValue={request.description}
					/>
				</div>

				{/* Address */}
				<div>
					<label className={LABEL}>Property Address</label>
					<AddressForm
						mode={request.address ? "edit" : "create"}
						originalValue={request.address || ""}
						originalCoords={request.coords}
						dropdownPosition="below"
						handleChange={handleChangeAddress}
						handleClear={handleClearAddress}
					/>
				</div>

				{/* Priority */}
				<div>
					<label className={LABEL}>Priority</label>
					<Dropdown
						refToApply={priorityRef}
						entries={priorityEntries}
					/>
				</div>

				{/* Valid Until + Expires At */}
				<div className="grid grid-cols-2 gap-2 lg:gap-3">
					<div>
						<label className={LABEL}>Valid Until</label>
						<DatePicker
							value={validUntil}
							onChange={setValidUntil}
							disabled={isLoading}
							align="left"
						/>
					</div>
					<div>
						<label className={LABEL}>Expires At</label>
						<DatePicker
							value={expiresAt}
							onChange={setExpiresAt}
							disabled={isLoading}
							align="right"
						/>
					</div>
				</div>

				{/* Note */}
				<div className="p-3 bg-amber-900/20 border border-amber-700/50 rounded-md">
					<p className="text-xs text-amber-200">
						The quote will be created with no line items. You
						can add pricing details after creation.
					</p>
				</div>
			</div>

			{/* Footer */}
			<div className="flex items-center justify-end gap-2 px-4 py-2.5 border-t border-zinc-700 bg-zinc-900 flex-shrink-0">
				<button
					onClick={() => setIsModalOpen(false)}
					disabled={isLoading}
					className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md border border-zinc-700 bg-transparent text-sm font-medium text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 hover:border-zinc-600 transition-colors disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap"
				>
					Cancel
				</button>
				<button
					onClick={invokeConvert}
					disabled={isLoading}
					className="inline-flex items-center h-8 px-4 rounded-md bg-blue-600 hover:bg-blue-500 disabled:bg-zinc-700 disabled:text-zinc-500 text-sm font-semibold text-white transition-colors disabled:cursor-not-allowed whitespace-nowrap"
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
