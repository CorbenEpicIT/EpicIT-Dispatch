import LoadSvg from "../../assets/icons/loading.svg?react";
import { useRef, useState } from "react";
import type { ZodError } from "zod";
import FullPopup from "../ui/FullPopup";
import { CreateClientSchema, type CreateClientInput } from "../../types/clients";
import type { GeocodeResult } from "../../types/location";
import AddressForm from "../ui/AddressForm";
import { X } from "lucide-react";
import { useQBCustomerQuery, useQBMappedCustomersQuery, useQBStatusQuery } from "../../hooks/useQuickbooks";
import { useAllClientsQuery } from "../../hooks/useClients";

interface CreateClientProps {
	isModalOpen: boolean;
	setIsModalOpen: React.Dispatch<React.SetStateAction<boolean>>;
	createClient: (input: CreateClientInput) => Promise<string>;
}

const LABEL = "block mb-0.5 text-xs font-medium text-text-tertiary uppercase tracking-wider";
const INPUT =
	"border border-border px-2.5 h-[34px] w-full rounded bg-base text-text-primary text-sm focus:border-primary focus:outline-none transition-colors";

const CreateClient = ({ isModalOpen, setIsModalOpen, createClient }: CreateClientProps) => {
	const nameRef = useRef<HTMLInputElement>(null);
	const [geoData, setGeoData] = useState<GeocodeResult>();
	const [isLoading, setIsLoading] = useState(false);
	const [errors, setErrors] = useState<ZodError | null>(null);
	const [mode, setMode] = useState<"new" | "import">("new");
	const [selectedQBId, setSelectedQBId] = useState("");
	const [submitError, setSubmitError] = useState<string | null>(null);

	const { data: qbStatus } = useQBStatusQuery();
	const { data: customers, isLoading: loadingCustomers } = useQBCustomerQuery(
		qbStatus?.connected,
	);
	const { data: mappedIds } = useQBMappedCustomersQuery(qbStatus?.connected);
	const { data: existingClients } = useAllClientsQuery();

	const existingNames = new Set(existingClients?.map((c) => c.name.toLowerCase()) ?? []);

	const selectedCustomer = customers?.find((c) => c.Id === selectedQBId);

	const handleChangeAddress = (result: GeocodeResult) => {
		setGeoData({ address: result.address, coords: result.coords });
	};

	const handleModeChange = (next: "new" | "import") => {
		setMode(next);
		setSelectedQBId("");
		if (nameRef.current) nameRef.current.value = "";
		setGeoData(undefined);
		setErrors(null);
		setSubmitError(null);
	};

	const handleCustomerSelect = (id: string) => {
		if (id === "") {
			setSelectedQBId("");
			if (nameRef.current) nameRef.current.value = "";
			setGeoData(undefined);
			return;
		}
		setSelectedQBId(id);
		const customer = customers?.find((c) => c.Id === id);
		if (customer && nameRef.current) {
			nameRef.current.value = customer.DisplayName;
		}
	};

	const invokeCreate = async () => {
		if (!nameRef.current || isLoading) return;

		if (!geoData) {
			setSubmitError("Select an address from the suggestions dropdown.");
			return;
		}

		const newClient: CreateClientInput = {
			name: nameRef.current.value.trim(),
			address: geoData.address.trim(),
			coords: geoData.coords,
			is_active: selectedCustomer?.Active ?? true,
			...(mode === "import" && selectedQBId ? { 
				qb_customer_id: selectedQBId,
				qb_contact_email: selectedCustomer?.PrimaryEmailAddr?.Address,
				qb_contact_name: [selectedCustomer?.GivenName, selectedCustomer?.FamilyName].filter(Boolean).join(" ") || selectedCustomer?.DisplayName,
				qb_contact_phone: selectedCustomer?.PrimaryPhone?.FreeFormNumber,
			 } : {}),
		};

		const parseResult = CreateClientSchema.safeParse(newClient);
		if (!parseResult.success) {
			setErrors(parseResult.error);
			return;
		}

		setErrors(null);
		setSubmitError(null);
		setIsLoading(true);
		try {
			await createClient(newClient);
			setIsModalOpen(false);
		} catch (e) {
			setSubmitError(e instanceof Error ? e.message : "Failed to create client.");
		} finally {
			setIsLoading(false);
		}
	};

	const nameErrors = errors?.issues.filter((e) => e.path[0] === "name") ?? [];
	const addressErrors = errors?.issues.filter((e) => e.path[0] === "address") ?? [];

	const qbAddressHint = selectedCustomer?.BillAddr
		? [
				selectedCustomer.BillAddr.Line1,
				selectedCustomer.BillAddr.City,
				selectedCustomer.BillAddr.CountrySubDivisionCode,
				selectedCustomer.BillAddr.PostalCode,
			]
				.filter(Boolean)
				.join(", ")
		: null;

	const content = (
		<div className="flex flex-col">
			{/* Header */}
			<div className="flex items-center justify-between px-4 sm:px-5 pt-4 pb-3 border-b border-border flex-shrink-0">
				<h2 className="text-lg sm:text-xl font-bold text-text-primary whitespace-nowrap">
					New Client
				</h2>
				<button
					onClick={() => setIsModalOpen(false)}
					className="p-1.5 text-text-tertiary hover:text-text-primary hover:bg-surface rounded transition-colors"
					disabled={isLoading}
				>
					<X size={18} />
				</button>
			</div>

			{/* Body */}
			<div className="px-4 sm:px-5 pt-3 sm:pt-4 pb-4 space-y-4">
				{/* Mode toggle ─ only shown when QB is connected */}
				{qbStatus?.connected && (
					<div className="flex rounded-md border border-border overflow-hidden text-sm">
						<button
							type="button"
							onClick={() => handleModeChange("new")}
							className={`flex-1 h-8 font-medium transition-colors ${
								mode === "new"
									? "bg-surface text-text-primary"
									: "bg-transparent text-text-tertiary hover:text-text-primary"
							}`}
						>
							New Client
						</button>
						<button
							type="button"
							onClick={() => handleModeChange("import")}
							className={`flex-1 h-8 font-medium transition-colors ${
								mode === "import"
									? "bg-surface text-text-primary"
									: "bg-transparent text-text-tertiary hover:text-text-primary"
							}`}
						>
							Import from QuickBooks
						</button>
					</div>
				)}

				{/* QB customer select ─ import mode only */}
				{mode === "import" && (
					<div>
						<label className={LABEL}>QuickBooks Customer *</label>
						<select
							value={selectedQBId}
							onChange={(e) => handleCustomerSelect(e.target.value)}
							className={INPUT}
							disabled={loadingCustomers}
						>
							<option value="">─Select a customer─</option>
							{customers
							?.filter((c) =>
								!mappedIds?.includes(c.Id) &&
								!existingNames.has(c.DisplayName.toLowerCase())
							)
							.map((c) => (
								<option key={c.Id} value={c.Id}>
									{c.DisplayName}
								</option>
							))}
						</select>
						{qbAddressHint && (
							<p className="mt-1 text-xs text-text-tertiary">
								QB address: {qbAddressHint}
							</p>
						)}
						 {selectedCustomer?.PrimaryEmailAddr?.Address && (
							<p className="mt-1 text-xs text-text-tertiary">
								Will create primary contact: &ensp;
								{selectedCustomer.PrimaryEmailAddr.Address}
								{selectedCustomer.PrimaryPhone?.FreeFormNumber && (
									<> · {selectedCustomer.PrimaryPhone.FreeFormNumber}</>
								)}
							</p>
						)}
					</div>
				)}

				{/* Name */}
				<div>
					<label className={LABEL}>Client Name *</label>
					<input
						type="text"
						placeholder="e.g. Riverside Properties"
						className={INPUT}
						disabled={isLoading}
						ref={nameRef}
					/>
					{nameErrors.map((err) => (
						<p className="mt-1 text-xs text-error-text" key={err.message}>
							{err.message}
						</p>
					))}
				</div>

				{/* Address */}
				<div>
					<label className={LABEL}>Address *</label>
					<AddressForm handleChange={handleChangeAddress} />
					{addressErrors.map((err) => (
						<p className="mt-1 text-xs text-error-text" key={err.message}>
							{err.message}
						</p>
					))}
				</div>
			</div>

			{/* Footer */}
			<div className="flex items-center justify-between gap-2 px-4 py-2.5 border-t border-border bg-base flex-shrink-0">
				{submitError ? (
					<p className="text-xs text-error-text">{submitError}</p>
				) : (
					<span />
				)}
				{isLoading ? (
					<LoadSvg className="w-8 h-8" />
				) : (
					<div className="flex items-center gap-2">
						<button
							onClick={() => setIsModalOpen(false)}
							className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md border border-border bg-transparent text-sm font-medium text-text-tertiary hover:text-text-primary hover:bg-surface hover:border-border-strong transition-colors whitespace-nowrap"
						>
							Cancel
						</button>
						<button
							onClick={invokeCreate}
							className="inline-flex items-center h-8 px-4 rounded-md bg-confirm hover:bg-confirm-hover text-sm font-semibold text-on-primary transition-colors whitespace-nowrap"
						>
							{mode === "import" ? "Import Client" : "Create Client"}
						</button>
					</div>
				)}
			</div>
		</div>
	);

	return (
		<FullPopup
			content={content}
			isModalOpen={isModalOpen}
			onClose={() => setIsModalOpen(false)}
			overflowVisible
		/>
	);
};

export default CreateClient;

