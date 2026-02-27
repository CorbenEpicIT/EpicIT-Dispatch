import LoadSvg from "../../assets/icons/loading.svg?react";
import Button from "../ui/Button";
import { useRef, useState, useEffect } from "react";
import type { ZodError } from "zod";
import FullPopup from "../ui/FullPopup";
import {
	CreateRequestSchema,
	RequestPriorityValues,
	type CreateRequestInput,
} from "../../types/requests";
import { useAllClientsQuery } from "../../hooks/useClients";
import type { GeocodeResult } from "../../types/location";
import Dropdown from "../ui/Dropdown";
import AddressForm from "../ui/AddressForm";

interface CreateRequestProps {
	isModalOpen: boolean;
	setIsModalOpen: React.Dispatch<React.SetStateAction<boolean>>;
	createRequest: (input: CreateRequestInput) => Promise<string>;
}

const CreateRequest = ({ isModalOpen, setIsModalOpen, createRequest }: CreateRequestProps) => {
	const titleRef = useRef<HTMLInputElement>(null);
	const descRef = useRef<HTMLTextAreaElement>(null);
	const clientRef = useRef<HTMLSelectElement>(null);
	const priorityRef = useRef<HTMLSelectElement>(null);
	const sourceRef = useRef<HTMLInputElement>(null);
	const sourceReferenceRef = useRef<HTMLInputElement>(null);
	const requiresQuoteRef = useRef<HTMLInputElement>(null);
	const estimatedValueRef = useRef<HTMLInputElement>(null);
	const [geoData, setGeoData] = useState<GeocodeResult>();
	const [isLoading, setIsLoading] = useState(false);
	const [errors, setErrors] = useState<ZodError | null>(null);
	const { data: clients } = useAllClientsQuery();

	const resetForm = () => {
		if (titleRef.current) titleRef.current.value = "";
		if (descRef.current) descRef.current.value = "";
		if (sourceRef.current) sourceRef.current.value = "";
		if (sourceReferenceRef.current) sourceReferenceRef.current.value = "";
		if (requiresQuoteRef.current) requiresQuoteRef.current.checked = false;
		if (estimatedValueRef.current) estimatedValueRef.current.value = "";
		setGeoData(undefined);

		setErrors(null);
	};

	useEffect(() => {
		if (!isModalOpen) {
			resetForm();
			setIsLoading(false);
		}
	}, [isModalOpen]);

	const handleChangeAddress = (result: GeocodeResult) => {
		setGeoData(() => ({
			address: result.address,
			coords: result.coords,
		}));
	};

	let dropdownEntries;
	if (clients && clients.length) {
		dropdownEntries = (
			<>
				{clients.map((c) => (
					<option value={c.id} key={c.id} className="text-black">
						{c.name}
					</option>
				))}
			</>
		);
	} else {
		dropdownEntries = (
			<>
				<option disabled selected value={""} className="text-black">
					No clients found
				</option>
			</>
		);
	}

	const priorityEntries = (
		<>
			{RequestPriorityValues.map((v) => (
				<option key={v} value={v} className="text-black">
					{v}
				</option>
			))}
		</>
	);

	const invokeCreate = async () => {
		if (
			titleRef.current &&
			clientRef.current &&
			descRef.current &&
			priorityRef.current &&
			!isLoading
		) {
			const titleValue = titleRef.current.value.trim();
			const clientValue = clientRef.current.value.trim();
			const descValue = descRef.current.value.trim();
			const priorityValue = priorityRef.current.value.trim();
			const sourceValue = sourceRef.current?.value.trim() || null;
			const sourceReferenceValue =
				sourceReferenceRef.current?.value.trim() || null;
			const requiresQuoteValue = requiresQuoteRef.current?.checked || false;
			const estimatedValueValue = estimatedValueRef.current?.value
				? parseFloat(estimatedValueRef.current.value)
				: null;

			const newRequest: CreateRequestInput = {
				title: titleValue,
				client_id: clientValue,
				address: geoData?.address,
				description: descValue,
				priority: priorityValue as
					| "Low"
					| "Medium"
					| "High"
					| "Urgent"
					| "Emergency",
				source: sourceValue,
				source_reference: sourceReferenceValue,
				requires_quote: requiresQuoteValue,
				estimated_value: estimatedValueValue,
				coords: geoData?.coords,
			};

			const parseResult = CreateRequestSchema.safeParse(newRequest);

			if (!parseResult.success) {
				setErrors(parseResult.error);
				return;
			}

			setErrors(null);
			setIsLoading(true);

			await createRequest(newRequest);

			setIsLoading(false);
			resetForm();
			setIsModalOpen(false);
		}
	};

	let titleErrors;
	let addressErrors;
	let clientErrors;
	let descriptionErrors;

	if (errors) {
		titleErrors = errors.issues.filter((err) => err.path[0] == "title");
		addressErrors = errors.issues.filter((err) => err.path[0] == "address");
		clientErrors = errors.issues.filter((err) => err.path[0] == "client_id");
		descriptionErrors = errors.issues.filter((err) => err.path[0] == "description");
	}

	const content = (
		<>
			<h2 className="text-2xl font-bold mb-4">Create New Request</h2>

			<p className="mb-1 hover:color-accent">Title *</p>
			<input
				type="text"
				placeholder="Request Title"
				className="border border-zinc-800 p-2 w-full rounded-sm"
				disabled={isLoading}
				ref={titleRef}
			/>

			{titleErrors && (
				<div>
					{titleErrors.map((err) => (
						<h3 className="my-1 text-red-300" key={err.message}>
							{err.message}
						</h3>
					))}
				</div>
			)}

			<p className="mb-1 mt-3 hover:color-accent">Client *</p>
			<div className="border border-zinc-800 rounded-sm">
				<Dropdown refToApply={clientRef} entries={dropdownEntries} />
			</div>

			{clientErrors && (
				<div>
					{clientErrors.map((err) => (
						<h3 className="my-1 text-red-300" key={err.message}>
							{err.message}
						</h3>
					))}
				</div>
			)}

			<p className="mb-1 mt-3 hover:color-accent">Description *</p>
			<textarea
				placeholder="Request Description"
				className="border border-zinc-800 p-2 w-full h-24 rounded-sm"
				disabled={isLoading}
				ref={descRef}
			></textarea>

			{descriptionErrors && (
				<div>
					{descriptionErrors.map((err) => (
						<h3 className="my-1 text-red-300" key={err.message}>
							{err.message}
						</h3>
					))}
				</div>
			)}

			<p className="mb-1 mt-3 hover:color-accent">Address (Optional)</p>
			<AddressForm handleChange={handleChangeAddress} />

			{addressErrors && (
				<div>
					{addressErrors.map((err) => (
						<h3 className="my-1 text-red-300" key={err.message}>
							{err.message}
						</h3>
					))}
				</div>
			)}

			<p className="mb-1 mt-3 hover:color-accent">Priority</p>
			<div className="border border-zinc-800 rounded-sm">
				<Dropdown refToApply={priorityRef} entries={priorityEntries} />
			</div>

			<p className="mb-1 mt-3 hover:color-accent">Source (Optional)</p>
			<input
				type="text"
				placeholder="e.g., Phone Call, Website, Email"
				className="border border-zinc-800 p-2 w-full rounded-sm"
				disabled={isLoading}
				ref={sourceRef}
			/>

			<p className="mb-1 mt-3 hover:color-accent">Source Reference (Optional)</p>
			<input
				type="text"
				placeholder="e.g., Ticket #12345, Email ID"
				className="border border-zinc-800 p-2 w-full rounded-sm"
				disabled={isLoading}
				ref={sourceReferenceRef}
			/>

			<div className="mt-3 flex items-center gap-2">
				<input
					type="checkbox"
					id="requires_quote"
					className="w-4 h-4 rounded border-zinc-800"
					disabled={isLoading}
					ref={requiresQuoteRef}
				/>
				<label htmlFor="requires_quote" className="text-sm cursor-pointer">
					Requires Quote
				</label>
			</div>

			<p className="mb-1 mt-3 hover:color-accent">Estimated Value (Optional)</p>
			<input
				type="number"
				step="0.01"
				min="0"
				placeholder="0.00"
				className="border border-zinc-800 p-2 w-full rounded-sm"
				disabled={isLoading}
				ref={estimatedValueRef}
			/>

			<div className="transition-all flex justify-end space-x-2 mt-4">
				{isLoading ? (
					<LoadSvg className="w-10 h-10" />
				) : (
					<>
						<div
							className="border-1 border-zinc-800 rounded-sm cursor-pointer hover:bg-zinc-800 transition-all"
							onClick={() => {
								resetForm();
								setIsModalOpen(false);
							}}
						>
							<Button label="Cancel" />
						</div>
						<div
							className="border-1 border-zinc-800 rounded-sm cursor-pointer hover:bg-zinc-800 transition-all font-bold"
							onClick={() => {
								invokeCreate();
							}}
						>
							<Button label="Create Request" />
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
			onClose={() => {
				resetForm();
				setIsModalOpen(false);
			}}
		/>
	);
};

export default CreateRequest;
