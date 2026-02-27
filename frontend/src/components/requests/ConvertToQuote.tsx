import LoadSvg from "../../assets/icons/loading.svg?react";
import Button from "../ui/Button";
import { useRef, useState, useEffect } from "react";
import FullPopup from "../ui/FullPopup";
import { QuotePriorityValues, type CreateQuoteInput } from "../../types/quotes";
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
			? {
					address: request.address || "",
					coords: request.coords,
				}
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
		setGeoData(() => ({
			address: result.address,
			coords: result.coords,
		}));
	};

	const handleClearAddress = () => {
		// In edit mode, revert to original if it exists
		if (request.address || request.coords) {
			setGeoData({
				address: request.address || "",
				coords: request.coords,
			});
		} else {
			setGeoData(undefined);
		}
	};

	const priorityEntries = (
		<>
			{QuotePriorityValues.map((v) => (
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

			// Reset errors
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

				// Reset form
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
		<>
			<h2 className="text-2xl font-bold mb-4">Convert to Quote</h2>

			<p className="mb-1 hover:color-accent">Quote Title *</p>
			<input
				type="text"
				placeholder="Quote Title"
				className="border border-zinc-800 p-2 w-full rounded-sm"
				disabled={isLoading}
				ref={titleRef}
				defaultValue={request.title}
				onChange={() => setTitleError(null)}
			/>
			{titleError && <p className="text-red-500 text-sm mt-1">{titleError}</p>}

			<p className="mb-1 mt-3 hover:color-accent">Description</p>
			<textarea
				placeholder="Quote Description"
				className="border border-zinc-800 p-2 w-full h-24 rounded-sm"
				disabled={isLoading}
				ref={descRef}
				defaultValue={request.description}
			/>

			<p className="mb-1 mt-3 hover:color-accent">Property Address</p>
			<AddressForm
				mode={request.address ? "edit" : "create"}
				originalValue={request.address || ""}
				originalCoords={request.coords}
				handleChange={handleChangeAddress}
				handleClear={handleClearAddress}
			/>

			<p className="mb-1 mt-3 hover:color-accent">Priority</p>
			<div className="border border-zinc-800 rounded-sm">
				<Dropdown refToApply={priorityRef} entries={priorityEntries} />
			</div>

			<div className="grid grid-cols-2 gap-3 mt-3">
				<div>
					<p className="mb-1 hover:color-accent">Valid Until</p>
					<input
						type="date"
						className="border border-zinc-800 p-2 w-full rounded-sm"
						disabled={isLoading}
						ref={validUntilRef}
					/>
				</div>
				<div>
					<p className="mb-1 hover:color-accent">Expires At</p>
					<input
						type="date"
						className="border border-zinc-800 p-2 w-full rounded-sm"
						disabled={isLoading}
						ref={expiresAtRef}
					/>
				</div>
			</div>

			<div className="p-3 mt-4 bg-amber-900/20 border border-amber-700/50 rounded-md">
				<p className="text-xs text-amber-200">
					Note: The quote will be created with no line items. You can
					add pricing details after creation.
				</p>
			</div>

			<div className="transition-all flex justify-end space-x-2 mt-4">
				{isLoading ? (
					<LoadSvg className="w-10 h-10" />
				) : (
					<>
						<div
							className="border-1 border-zinc-800 rounded-sm cursor-pointer hover:bg-zinc-800 transition-all"
							onClick={() => setIsModalOpen(false)}
						>
							<Button label="Cancel" />
						</div>
						<div
							className="border-1 border-zinc-800 rounded-sm cursor-pointer hover:bg-zinc-800 transition-all font-bold"
							onClick={invokeConvert}
						>
							<Button label="Create Quote" />
						</div>
					</>
				)}
			</div>
		</>
	);

	return (
		<FullPopup
			content={content}
			isModalOpen={isModalOpen}
			onClose={() => !isLoading && setIsModalOpen(false)}
		/>
	);
}
