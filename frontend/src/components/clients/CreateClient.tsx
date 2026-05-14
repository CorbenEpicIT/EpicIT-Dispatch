import LoadSvg from "../../assets/icons/loading.svg?react";
import { useRef, useState } from "react";
import type { ZodError } from "zod";
import FullPopup from "../ui/FullPopup";
import { CreateClientSchema, type CreateClientInput } from "../../types/clients";
import type { GeocodeResult } from "../../types/location";
import AddressForm from "../ui/AddressForm";
import { X } from "lucide-react";

interface CreateClientProps {
	isModalOpen: boolean;
	setIsModalOpen: React.Dispatch<React.SetStateAction<boolean>>;
	createClient: (input: CreateClientInput) => Promise<string>;
}

const LABEL = "block mb-0.5 text-xs font-medium text-text-tertiary uppercase tracking-wider";
const INPUT =
	"border border-border px-2.5 h-[34px] w-full rounded bg-base text-white text-sm focus:border-primary focus:outline-none transition-colors";

const CreateClient = ({ isModalOpen, setIsModalOpen, createClient }: CreateClientProps) => {
	const nameRef = useRef<HTMLInputElement>(null);
	const [geoData, setGeoData] = useState<GeocodeResult>();
	const [isLoading, setIsLoading] = useState(false);
	const [errors, setErrors] = useState<ZodError | null>(null);

	const handleChangeAddress = (geoData: GeocodeResult) => {
		setGeoData({ address: geoData.address, coords: geoData.coords });
	};

	const invokeCreate = async () => {
		if (!nameRef.current || !geoData || isLoading) return;

		const newClient: CreateClientInput = {
			name: nameRef.current.value.trim(),
			address: geoData.address.trim(),
			coords: geoData.coords,
			is_active: true,
		};

		const parseResult = CreateClientSchema.safeParse(newClient);
		if (!parseResult.success) {
			setErrors(parseResult.error);
			return;
		}

		setErrors(null);
		setIsLoading(true);
		try {
			await createClient(newClient);
			setIsModalOpen(false);
		} finally {
			setIsLoading(false);
		}
	};

	const nameErrors = errors?.issues.filter((e) => e.path[0] === "name") ?? [];
	const addressErrors = errors?.issues.filter((e) => e.path[0] === "address") ?? [];

	const content = (
		<div className="flex flex-col">
			{/* Header */}
			<div className="flex items-center justify-between px-4 sm:px-5 pt-4 pb-3 border-b border-border flex-shrink-0">
				<h2 className="text-lg sm:text-xl font-bold text-white whitespace-nowrap">
					New Client
				</h2>
				<button
					onClick={() => setIsModalOpen(false)}
					className="p-1.5 text-text-tertiary hover:text-white hover:bg-surface rounded transition-colors"
					disabled={isLoading}
				>
					<X size={18} />
				</button>
			</div>

			{/* Body */}
			<div className="px-4 sm:px-5 pt-3 sm:pt-4 pb-4 space-y-4">
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
						<p
							className="mt-1 text-xs text-error-text"
							key={err.message}
						>
							{err.message}
						</p>
					))}
				</div>

				{/* Address */}
				<div>
					<label className={LABEL}>Address *</label>
					<AddressForm handleChange={handleChangeAddress} />
					{addressErrors.map((err) => (
						<p
							className="mt-1 text-xs text-error-text"
							key={err.message}
						>
							{err.message}
						</p>
					))}
				</div>
			</div>

			{/* Footer */}
			<div className="flex items-center justify-end gap-2 px-4 py-2.5 border-t border-border bg-base flex-shrink-0">
				{isLoading ? (
					<LoadSvg className="w-8 h-8" />
				) : (
					<>
						<button
							onClick={() => setIsModalOpen(false)}
							className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md border border-border bg-transparent text-sm font-medium text-text-tertiary hover:text-text-primary hover:bg-surface hover:border-border-strong transition-colors whitespace-nowrap"
						>
							Cancel
						</button>
						<button
							onClick={invokeCreate}
							className="inline-flex items-center h-8 px-4 rounded-md bg-confirm hover:bg-confirm-hover text-sm font-semibold text-white transition-colors whitespace-nowrap"
						>
							Create Client
						</button>
					</>
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
