import { useState, useEffect, useMemo, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import type { ZodError } from "zod";
import { CreateRequestSchema, type CreateRequestInput } from "../../types/requests";
import { type Priority, PriorityValues } from "../../types/common";
import { useAllClientsQuery } from "../../hooks/useClients";
import type { GeocodeResult } from "../../types/location";
import Dropdown from "../ui/Dropdown";
import AddressForm from "../ui/AddressForm";
import { FormWizardContainer } from "../ui/forms/FormWizardContainer";

interface CreateRequestProps {
	isModalOpen: boolean;
	setIsModalOpen: React.Dispatch<React.SetStateAction<boolean>>;
	createRequest: (input: CreateRequestInput) => Promise<string>;
}

const PRIORITY_ENTRIES = (
	<>
		{PriorityValues.map((v) => (
			<option key={v} value={v} className="text-black">
				{v}
			</option>
		))}
	</>
);

const CreateRequest = ({ isModalOpen, setIsModalOpen, createRequest }: CreateRequestProps) => {
	const navigate = useNavigate();

	const [title, setTitle] = useState("");
	const [description, setDescription] = useState("");
	const [clientId, setClientId] = useState("");
	const [priority, setPriority] = useState<Priority>("Medium");
	const [geoData, setGeoData] = useState<GeocodeResult>();
	const [source, setSource] = useState("");
	const [sourceReference, setSourceReference] = useState("");
	const [requiresQuote, setRequiresQuote] = useState(false);
	const [estimatedValue, setEstimatedValue] = useState("");

	const [isLoading, setIsLoading] = useState(false);
	const [errors, setErrors] = useState<ZodError | null>(null);
	const { data: clients } = useAllClientsQuery();

	const resetForm = useCallback(() => {
		setTitle("");
		setDescription("");
		setClientId("");
		setPriority("Medium");
		setGeoData(undefined);
		setSource("");
		setSourceReference("");
		setRequiresQuote(false);
		setEstimatedValue("");
		setErrors(null);
	}, []);

	useEffect(() => {
		if (!isModalOpen) {
			resetForm();
			setIsLoading(false);
		}
	}, [isModalOpen, resetForm]);

	const handleChangeAddress = (result: GeocodeResult) => {
		setGeoData({
			address: result.address,
			coords: result.coords,
		});
	};

	const handleClearAddress = () => {
		setGeoData(undefined);
	};

	const clientDropdownEntries = useMemo(() => {
		if (clients && clients.length) {
			return clients.map((c) => (
				<option value={c.id} key={c.id}>
					{c.name}
				</option>
			));
		}
		return (
			<option disabled value="">
				No clients found
			</option>
		);
	}, [clients]);

	const invokeCreate = async () => {
		if (isLoading) return;

		const newRequest: CreateRequestInput = {
			title: title.trim(),
			client_id: clientId.trim(),
			address: geoData?.address,
			coords: geoData?.coords,
			description: description.trim(),
			priority: priority as Priority,
			source: source.trim() || null,
			source_reference: sourceReference.trim() || null,
			requires_quote: requiresQuote,
			estimated_value: estimatedValue ? parseFloat(estimatedValue) : null,
		};

		const parseResult = CreateRequestSchema.safeParse(newRequest);

		if (!parseResult.success) {
			setErrors(parseResult.error);
			console.error("Validation errors:", parseResult.error);
			return;
		}

		setErrors(null);
		setIsLoading(true);

		try {
			const requestId = await createRequest(newRequest);
			setIsModalOpen(false);
			resetForm();
			navigate(`/dispatch/requests/${requestId}`);
		} catch (error) {
			console.error("Failed to create request:", error);
		} finally {
			setIsLoading(false);
		}
	};

	const ErrorDisplay = ({ path }: { path: string }) => {
		if (!errors) return null;
		const fieldErrors = errors.issues.filter((err) => err.path[0] === path);
		if (fieldErrors.length === 0) return null;
		return (
			<div className="mt-1 space-y-1">
				{fieldErrors.map((err, idx) => (
					<p key={idx} className="text-red-300 text-sm">
						{err.message}
					</p>
				))}
			</div>
		);
	};

	const isFormValid = useMemo(() => {
		return !!(title.trim() && clientId.trim() && description.trim() && priority);
	}, [title, clientId, description, priority]);

	const formContent = useMemo(
		() => (
			<div className="space-y-3">
				{/* Title */}
				<div>
					<label className="block mb-1 text-sm text-zinc-300">
						Title *
					</label>
					<input
						type="text"
						placeholder="Request Title"
						value={title}
						onChange={(e) => setTitle(e.target.value)}
						className="border border-zinc-700 p-2 w-full rounded-md bg-zinc-900 text-white focus:border-blue-500 focus:outline-none transition-colors"
						disabled={isLoading}
					/>
					<ErrorDisplay path="title" />
				</div>

				{/* Client and Priority Row */}
				<div className="grid grid-cols-2 gap-3">
					<div>
						<label className="block mb-1 text-sm text-zinc-300">
							Client *
						</label>
						<Dropdown
							entries={clientDropdownEntries}
							value={clientId}
							onChange={(newValue) =>
								setClientId(newValue)
							}
							placeholder="Select client"
							disabled={isLoading}
							error={errors?.issues.some(
								(e) => e.path[0] === "client_id"
							)}
						/>
						<ErrorDisplay path="client_id" />
					</div>

					<div>
						<label className="block mb-1 text-sm text-zinc-300">
							Priority
						</label>
						<Dropdown
							entries={PRIORITY_ENTRIES}
							value={priority}
							onChange={(newValue) =>
								setPriority(newValue as Priority)
							}
							defaultValue="Medium"
							disabled={isLoading}
							error={errors?.issues.some(
								(e) => e.path[0] === "priority"
							)}
						/>
						<ErrorDisplay path="priority" />
					</div>
				</div>

				{/* Description */}
				<div>
					<label className="block mb-1 text-sm text-zinc-300">
						Description *
					</label>
					<textarea
						placeholder="Request Description"
						value={description}
						onChange={(e) => setDescription(e.target.value)}
						className="border border-zinc-700 p-2 w-full h-20 rounded-md bg-zinc-900 text-white resize-none focus:border-blue-500 focus:outline-none transition-colors"
						disabled={isLoading}
					/>
					<ErrorDisplay path="description" />
				</div>

				{/* Address */}
				<div className="relative z-10">
					<label className="block mb-1 text-sm text-zinc-300">
						Address (Optional)
					</label>
					<AddressForm
						mode={geoData ? "edit" : "create"}
						originalValue={geoData?.address || ""}
						originalCoords={geoData?.coords}
						dropdownPosition="above"
						handleChange={handleChangeAddress}
						handleClear={handleClearAddress}
					/>
					<ErrorDisplay path="address" />
					<ErrorDisplay path="coords" />
				</div>

				{/* Source and Source Reference Row */}
				<div className="grid grid-cols-2 gap-3">
					<div>
						<label className="block mb-1 text-sm text-zinc-300">
							Source (Optional)
						</label>
						<input
							type="text"
							placeholder="e.g., Phone Call, Website"
							value={source}
							onChange={(e) => setSource(e.target.value)}
							className="border border-zinc-700 p-2 w-full rounded-md bg-zinc-900 text-white focus:border-blue-500 focus:outline-none transition-colors"
							disabled={isLoading}
						/>
					</div>

					<div>
						<label className="block mb-1 text-sm text-zinc-300">
							Source Reference (Optional)
						</label>
						<input
							type="text"
							placeholder="e.g., Ticket #12345"
							value={sourceReference}
							onChange={(e) =>
								setSourceReference(e.target.value)
							}
							className="border border-zinc-700 p-2 w-full rounded-md bg-zinc-900 text-white focus:border-blue-500 focus:outline-none transition-colors"
							disabled={isLoading}
						/>
					</div>
				</div>

				{/* Requires Quote and Estimated Value Row */}
				<div className="grid grid-cols-2 gap-3">
					<div className="flex items-center pt-6">
						<input
							type="checkbox"
							id="requires_quote"
							checked={requiresQuote}
							onChange={(e) =>
								setRequiresQuote(e.target.checked)
							}
							className="w-4 h-4 rounded border-zinc-700 bg-zinc-900 text-blue-600 focus:ring-blue-500 focus:ring-2 cursor-pointer"
							disabled={isLoading}
						/>
						<label
							htmlFor="requires_quote"
							className="ml-2 text-sm text-zinc-300 cursor-pointer"
						>
							Requires Quote
						</label>
					</div>

					<div>
						<label className="block mb-1 text-sm text-zinc-300">
							Estimated Value (Optional)
						</label>
						<div className="relative">
							<span className="absolute left-2 top-1/2 -translate-y-1/2 text-zinc-400 text-sm">
								$
							</span>
							<input
								type="number"
								step="0.01"
								min="0"
								placeholder="0.00"
								value={estimatedValue}
								onChange={(e) =>
									setEstimatedValue(
										e.target.value
									)
								}
								className="border border-zinc-700 p-2 w-full rounded-md bg-zinc-900 text-white focus:border-blue-500 focus:outline-none transition-colors pl-6"
								disabled={isLoading}
							/>
						</div>
					</div>
				</div>
			</div>
		),
		[
			title,
			clientId,
			priority,
			description,
			geoData,
			source,
			sourceReference,
			requiresQuote,
			estimatedValue,
			isLoading,
			clientDropdownEntries,
			errors,
		]
	);

	return (
		<FormWizardContainer
			title="Create Request"
			steps={[]}
			currentStep={1}
			visitedSteps={new Set([1])}
			isLoading={isLoading}
			isOpen={isModalOpen}
			onClose={() => setIsModalOpen(false)}
			onSubmit={invokeCreate}
			canGoNext={isFormValid}
			submitLabel="Create Request"
		>
			{formContent}
		</FormWizardContainer>
	);
};

export default CreateRequest;
