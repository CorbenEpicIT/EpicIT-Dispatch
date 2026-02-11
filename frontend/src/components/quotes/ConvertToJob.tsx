import LoadSvg from "../../assets/icons/loading.svg?react";
import Button from "../ui/Button";
import { useRef, useState, useEffect } from "react";
import FullPopup from "../ui/FullPopup";
import { type CreateJobInput } from "../../types/jobs";
import { PriorityValues } from "../../types/common";
import type { Quote } from "../../types/quotes";
import type { GeocodeResult } from "../../types/location";
import Dropdown from "../ui/Dropdown";
import AddressForm from "../ui/AddressForm";
import { RotateCcw } from "lucide-react";

interface ConvertToJobProps {
	isModalOpen: boolean;
	setIsModalOpen: (open: boolean) => void;
	quote: Quote;
	onConvert: (jobData: CreateJobInput) => Promise<string>;
}

export default function ConvertToJob({
	isModalOpen,
	setIsModalOpen,
	quote,
	onConvert,
}: ConvertToJobProps) {
	const nameRef = useRef<HTMLInputElement>(null);
	const descRef = useRef<HTMLTextAreaElement>(null);
	const priorityRef = useRef<HTMLSelectElement>(null);

	const [geoData, setGeoData] = useState<GeocodeResult | undefined>(undefined);
	const [isLoading, setIsLoading] = useState(false);
	const [errorMessage, setErrorMessage] = useState<string | null>(null);

	const originalsRef = useRef({
		name: "",
		description: "",
		priority: "Medium" as (typeof PriorityValues)[number],
		address: "",
		coords: undefined as any,
	});

	const [dirty, setDirty] = useState<Record<string, boolean>>({});
	const setFieldDirty = (key: string, isDirty: boolean) => {
		setDirty((prev) => {
			if (prev[key] === isDirty) return prev;
			return { ...prev, [key]: isDirty };
		});
	};

	const revertIfBlank = (
		el: HTMLInputElement | HTMLTextAreaElement | null,
		original: string,
		key: string
	) => {
		if (!el) return;
		if (el.value.trim() === "") {
			el.value = original;
			setFieldDirty(key, false);
		}
	};

	const undoToOriginal = (
		el: HTMLInputElement | HTMLTextAreaElement | null,
		original: string,
		key: string
	) => {
		if (!el) return;
		el.value = original;
		setFieldDirty(key, false);
	};

	useEffect(() => {
		if (!isModalOpen) return;

		const initialName = quote.title ?? "";
		const initialDesc = quote.description ?? "";
		const initialPriority = (
			PriorityValues.includes(quote.priority as any)
				? (quote.priority as any)
				: "Medium"
		) as (typeof PriorityValues)[number];

		const initialAddress = quote.address ?? "";
		const initialCoords = quote.coords ?? undefined;

		originalsRef.current = {
			name: initialName,
			description: initialDesc,
			priority: initialPriority,
			address: initialAddress,
			coords: initialCoords,
		};

		if (nameRef.current) nameRef.current.value = initialName;
		if (descRef.current) descRef.current.value = initialDesc;
		if (priorityRef.current) priorityRef.current.value = initialPriority;

		if (initialAddress) {
			setGeoData({
				address: initialAddress,
				coords: initialCoords,
			} as GeocodeResult);
		} else {
			setGeoData(undefined);
		}

		setDirty({});
		setErrorMessage(null);
	}, [isModalOpen, quote]);

	const handleChangeAddress = (result: GeocodeResult) => {
		setGeoData(() => ({
			address: result.address,
			coords: result.coords,
		}));

		setFieldDirty(
			"address",
			(result.address || "") !== (originalsRef.current.address || "") ||
				JSON.stringify(result.coords || null) !==
					JSON.stringify(originalsRef.current.coords || null)
		);
	};

	const undoAddressToOriginal = () => {
		const originalAddress = originalsRef.current.address || "";
		const originalCoords = originalsRef.current.coords;

		if (!originalAddress) {
			setGeoData(undefined);
		} else {
			setGeoData({
				address: originalAddress,
				coords: originalCoords,
			} as GeocodeResult);
		}

		setFieldDirty("address", false);
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
		if (!nameRef.current || !descRef.current || !priorityRef.current) return;
		if (isLoading) return;

		revertIfBlank(nameRef.current, originalsRef.current.name, "name");
		revertIfBlank(descRef.current, originalsRef.current.description, "description");

		const nameValue = nameRef.current.value.trim();
		const descValue = descRef.current.value.trim();
		const priorityValue = priorityRef.current.value.trim() as
			| "Low"
			| "Medium"
			| "High"
			| "Urgent"
			| "Emergency";

		if (!nameValue) {
			setErrorMessage("Job name is required");
			return;
		}

		if (!geoData?.address) {
			setErrorMessage("Job address is required");
			return;
		}

		setErrorMessage(null);
		setIsLoading(true);

		try {
			const jobData: CreateJobInput = {
				name: nameValue,
				client_id: quote.client_id,
				quote_id: quote.id,
				request_id: quote.request_id || undefined,

				address: geoData.address,
				coords: geoData.coords || { lat: 0, lon: 0 },

				description: descValue,
				priority: priorityValue,
				status: "Unscheduled",

				subtotal: quote.subtotal ? Number(quote.subtotal) : undefined,
				tax_rate: quote.tax_rate ? Number(quote.tax_rate) : undefined,
				tax_amount: quote.tax_amount ? Number(quote.tax_amount) : undefined,
				discount_type: quote.discount_type || undefined,
				discount_value: quote.discount_value
					? Number(quote.discount_value)
					: undefined,
				discount_amount: quote.discount_amount
					? Number(quote.discount_amount)
					: undefined,
				estimated_total: quote.total ? Number(quote.total) : undefined,
			};

			await onConvert(jobData);

			if (nameRef.current) nameRef.current.value = "";
			if (descRef.current) descRef.current.value = "";
			setGeoData(undefined);

			setIsModalOpen(false);
		} catch (error) {
			console.error("Failed to convert quote to job:", error);
			setErrorMessage(
				error instanceof Error
					? error.message
					: "Failed to convert quote to job"
			);
		} finally {
			setIsLoading(false);
		}
	};

	const content = (
		<>
			<h2 className="text-2xl font-bold mb-4">Convert to Job</h2>

			{errorMessage && (
				<div className="p-3 mb-4 bg-red-900/50 border border-red-700 rounded-md text-red-200 text-sm">
					{errorMessage}
				</div>
			)}

			<p className="mb-1 hover:color-accent">Job Name *</p>
			<div className="relative">
				<input
					type="text"
					placeholder="Job Name"
					className="border border-zinc-800 p-2 w-full rounded-sm pr-10"
					disabled={isLoading}
					ref={nameRef}
					defaultValue={quote.title}
					onChange={(e) =>
						setFieldDirty(
							"name",
							e.target.value.trim() !==
								originalsRef.current.name
						)
					}
					onBlur={() =>
						revertIfBlank(
							nameRef.current,
							originalsRef.current.name,
							"name"
						)
					}
				/>
				{dirty.name && (
					<button
						type="button"
						title="Undo"
						onClick={() =>
							undoToOriginal(
								nameRef.current,
								originalsRef.current.name,
								"name"
							)
						}
						className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-white transition-colors"
					>
						<RotateCcw size={16} />
					</button>
				)}
			</div>

			<p className="mb-1 mt-3 hover:color-accent">Description</p>
			<div className="relative">
				<textarea
					placeholder="Job Description"
					className="border border-zinc-800 p-2 w-full h-24 rounded-sm pr-10"
					disabled={isLoading}
					ref={descRef}
					defaultValue={quote.description}
					onChange={(e) =>
						setFieldDirty(
							"description",
							e.target.value.trim() !==
								originalsRef.current.description
						)
					}
					onBlur={() =>
						revertIfBlank(
							descRef.current,
							originalsRef.current.description,
							"description"
						)
					}
				/>
				{dirty.description && (
					<button
						type="button"
						title="Undo"
						onClick={() =>
							undoToOriginal(
								descRef.current,
								originalsRef.current.description,
								"description"
							)
						}
						className="absolute right-2 top-2 text-zinc-400 hover:text-white transition-colors"
					>
						<RotateCcw size={16} />
					</button>
				)}
			</div>

			<p className="mb-1 mt-3 hover:color-accent">Job Address *</p>
			<div className="relative">
				<AddressForm
					mode="edit"
					originalValue={originalsRef.current.address}
					originalCoords={originalsRef.current.coords}
					handleChange={handleChangeAddress}
				/>

				{/* Undo for address changes */}
				{dirty.address && (
					<button
						type="button"
						title="Undo"
						onClick={undoAddressToOriginal}
						className="absolute right-2 top-2 text-zinc-400 hover:text-white transition-colors"
					>
						<RotateCcw size={16} />
					</button>
				)}
			</div>

			<p className="mb-1 mt-3 hover:color-accent">Priority</p>
			<div className="relative border border-zinc-800 rounded-sm">
				<Dropdown
					refToApply={priorityRef}
					entries={priorityEntries}
					defaultValue={originalsRef.current.priority}
					onChange={(val) =>
						setFieldDirty(
							"priority",
							val !== originalsRef.current.priority
						)
					}
				/>
				{dirty.priority && (
					<button
						type="button"
						title="Undo"
						onClick={() => {
							if (priorityRef.current)
								priorityRef.current.value =
									originalsRef.current.priority;
							setFieldDirty("priority", false);
						}}
						className="absolute right-9 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-white transition-colors"
					>
						<RotateCcw size={16} />
					</button>
				)}
			</div>

			<div className="p-3 mt-4 bg-amber-900/20 border border-amber-700/50 rounded-md">
				<p className="text-xs text-amber-200">
					Note: The job will be created in "Unscheduled" status and
					line items will be copied from the quote. You can create
					visits and assign technicians after creation.
				</p>
			</div>

			<div className="flex justify-end space-x-2 mt-2">
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
							<Button label="Create Job" />
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
