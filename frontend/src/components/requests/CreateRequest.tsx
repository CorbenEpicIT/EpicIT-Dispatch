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
import { ChevronDown, ChevronUp } from "lucide-react";

interface CreateRequestProps {
	isModalOpen: boolean;
	setIsModalOpen: React.Dispatch<React.SetStateAction<boolean>>;
	createRequest: (input: CreateRequestInput) => Promise<string>;
}

const PRIORITY_ENTRIES = (
	<>
		{PriorityValues.map((v) => (
			<option key={v} value={v} className="text-black">
				{v.charAt(0).toUpperCase() + v.slice(1)}
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
	const [showAdditional, setShowAdditional] = useState(false);

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
		setShowAdditional(false);
		setErrors(null);
	}, []);

	useEffect(() => {
		if (!isModalOpen) {
			resetForm();
			setIsLoading(false);
		}
	}, [isModalOpen, resetForm]);

	useEffect(() => {
		if (!source.trim()) {
			setSourceReference("");
		}
	}, [source]);

	const handleChangeAddress = (result: GeocodeResult) => {
		setGeoData({ address: result.address, coords: result.coords });
	};

	const handleClearAddress = () => setGeoData(undefined);

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
			status: "Reviewing",
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
			<div className="mt-0.5">
				{fieldErrors.map((err, idx) => (
					<p key={idx} className="text-red-300 text-xs leading-tight">
						{err.message}
					</p>
				))}
			</div>
		);
	};

	const isFormValid = useMemo(() => {
		return !!(title.trim() && clientId.trim() && description.trim() && priority);
	}, [title, clientId, description, priority]);

	const additionalPreviewTags = useMemo(() => {
		const tags: string[] = [];
		if (source.trim()) tags.push(source.trim());
		if (sourceReference.trim()) tags.push(sourceReference.trim());
		if (requiresQuote) tags.push("Req. Quote");
		if (estimatedValue) tags.push(`$${estimatedValue}`);
		return tags;
	}, [source, sourceReference, requiresQuote, estimatedValue]);

	const formContent = useMemo(
		() => (
			<div className="space-y-2 lg:space-y-3 xl:space-y-4 min-w-0">
				{/* Title */}
				<div className="min-w-0">
					<label className="block mb-0.5 lg:mb-1 text-xs font-medium text-zinc-400 uppercase tracking-wider">
						Title *
					</label>
					<input
						type="text"
						placeholder="Request Title"
						value={title}
						onChange={(e) => setTitle(e.target.value)}
						className="border border-zinc-700 px-2.5 py-1.5 lg:py-2 xl:py-2.5 w-full rounded bg-zinc-900 text-white text-sm lg:text-base focus:border-blue-500 focus:outline-none transition-colors min-w-0"
						disabled={isLoading}
					/>
					<ErrorDisplay path="title" />
				</div>

				{/* Client and Priority Row */}
				<div className="grid grid-cols-2 gap-2 lg:gap-3 min-w-0">
					<div className="min-w-0">
						<label className="block mb-0.5 lg:mb-1 text-xs font-medium text-zinc-400 uppercase tracking-wider">
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

					<div className="min-w-0">
						<label className="block mb-0.5 lg:mb-1 text-xs font-medium text-zinc-400 uppercase tracking-wider">
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
				<div className="min-w-0">
					<label className="block mb-0.5 lg:mb-1 text-xs font-medium text-zinc-400 uppercase tracking-wider">
						Description *
					</label>
					<textarea
						placeholder="Request Description"
						value={description}
						onChange={(e) => setDescription(e.target.value)}
						className="border border-zinc-700 px-2.5 py-1.5 lg:py-2 w-full h-14 lg:h-20 xl:h-24 rounded bg-zinc-900 text-white text-sm lg:text-base resize-none focus:border-blue-500 focus:outline-none transition-colors min-w-0"
						disabled={isLoading}
					/>
					<ErrorDisplay path="description" />
				</div>

				{/* Address */}
				<div className="relative min-w-0" style={{ zIndex: 50 }}>
					<label className="block mb-0.5 lg:mb-1 text-xs font-medium text-zinc-400 uppercase tracking-wider">
						Address (Optional)
					</label>
					<div className="relative">
						<AddressForm
							mode={geoData ? "edit" : "create"}
							originalValue={geoData?.address || ""}
							originalCoords={geoData?.coords}
							dropdownPosition="above"
							handleChange={handleChangeAddress}
							handleClear={handleClearAddress}
						/>
					</div>
					<ErrorDisplay path="address" />
					<ErrorDisplay path="coords" />
				</div>

				{/* Additional Details Toggle */}
				<div className="min-w-0">
					<button
						type="button"
						onClick={() => setShowAdditional((v) => !v)}
						disabled={isLoading}
						className="w-full flex items-center justify-between px-2.5 py-1.5 rounded border border-zinc-700 bg-zinc-800/50 hover:bg-zinc-800 transition-colors text-xs font-medium text-zinc-400 uppercase tracking-wider disabled:opacity-50"
					>
						<span className="flex items-center gap-2">
							Additional Optional Details
							{!showAdditional &&
								additionalPreviewTags.length >
									0 && (
									<span className="flex items-center gap-1 normal-case">
										{additionalPreviewTags.map(
											(
												tag,
												i
											) => (
												<span
													key={
														i
													}
													className="px-1.5 py-0.5 rounded bg-zinc-700 text-zinc-300 text-[10px] font-normal tracking-normal"
												>
													{
														tag
													}
												</span>
											)
										)}
									</span>
								)}
						</span>
						{showAdditional ? (
							<ChevronUp size={14} />
						) : (
							<ChevronDown size={14} />
						)}
					</button>

					{showAdditional && (
						<div className="mt-2 space-y-2 lg:space-y-3 pl-0.5">
							{/* Source + Source Reference — half width, inline */}
							<div className="grid grid-cols-2 gap-2 lg:gap-3 min-w-0">
								<div className="min-w-0">
									<label className="block mb-0.5 lg:mb-1 text-xs font-medium text-zinc-400 uppercase tracking-wider">
										Source
									</label>
									<input
										type="text"
										placeholder="e.g., Phone Call, Website"
										value={source}
										onChange={(e) =>
											setSource(
												e
													.target
													.value
											)
										}
										className="border border-zinc-700 px-2.5 py-1.5 lg:py-2 xl:py-2.5 w-full rounded bg-zinc-900 text-white text-sm lg:text-base focus:border-blue-500 focus:outline-none transition-colors min-w-0"
										disabled={isLoading}
									/>
								</div>

								{source.trim() ? (
									<div className="min-w-0">
										<label className="block mb-0.5 lg:mb-1 text-xs font-medium text-zinc-400 uppercase tracking-wider">
											Source
											Reference
										</label>
										<input
											type="text"
											placeholder="e.g., Ticket #12345"
											value={
												sourceReference
											}
											onChange={(
												e
											) =>
												setSourceReference(
													e
														.target
														.value
												)
											}
											className="border border-zinc-700 px-2.5 py-1.5 lg:py-2 xl:py-2.5 w-full rounded bg-zinc-900 text-white text-sm lg:text-base focus:border-blue-500 focus:outline-none transition-colors min-w-0"
											disabled={
												isLoading
											}
										/>
									</div>
								) : (
									<div className="min-w-0" />
								)}
							</div>

							{/* Estimated Value (left) + Requires Quote (right) */}
							<div className="grid grid-cols-2 gap-2 lg:gap-3 min-w-0">
								<div className="min-w-0">
									<label className="block mb-0.5 lg:mb-1 text-xs font-medium text-zinc-400 uppercase tracking-wider">
										Estimated Value
									</label>
									<div className="relative">
										<span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-400 text-sm">
											$
										</span>
										<input
											type="number"
											step="0.01"
											min="0"
											placeholder="0.00"
											value={
												estimatedValue
											}
											onChange={(
												e
											) =>
												setEstimatedValue(
													e
														.target
														.value
												)
											}
											className="border border-zinc-700 px-2.5 py-1.5 lg:py-2 xl:py-2.5 w-full rounded bg-zinc-900 text-white text-sm lg:text-base focus:border-blue-500 focus:outline-none transition-colors pl-7 min-w-0"
											disabled={
												isLoading
											}
										/>
									</div>
								</div>

								<div className="flex items-end pb-1.5 lg:pb-3.5 min-w-0">
									<input
										type="checkbox"
										id="requires_quote"
										checked={
											requiresQuote
										}
										onChange={(e) =>
											setRequiresQuote(
												e
													.target
													.checked
											)
										}
										className="w-4 h-4 rounded border-zinc-700 bg-zinc-900 text-blue-600 focus:ring-blue-500 focus:ring-2 cursor-pointer"
										disabled={isLoading}
									/>
									<label
										htmlFor="requires_quote"
										className="ml-2 text-xs lg:text-sm text-zinc-400 cursor-pointer"
									>
										Requires Quote
									</label>
								</div>
							</div>
						</div>
					)}
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
			showAdditional,
			additionalPreviewTags,
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
