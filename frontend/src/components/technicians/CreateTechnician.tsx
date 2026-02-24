import { useState, useEffect, useMemo, useCallback } from "react";
import type { ZodError } from "zod";
import { CreateTechnicianSchema, type CreateTechnicianInput } from "../../types/technicians";
import { FormWizardContainer } from "../ui/forms/FormWizardContainer";
import DatePicker from "../ui/DatePicker";

interface CreateTechnicianProps {
	isModalOpen: boolean;
	setIsModalOpen: React.Dispatch<React.SetStateAction<boolean>>;
	createTechnician: (input: CreateTechnicianInput) => Promise<string>;
}

const INPUT =
	"border border-zinc-700 px-2.5 h-[34px] w-full rounded bg-zinc-900 text-white text-sm lg:text-base focus:border-blue-500 focus:outline-none transition-colors min-w-0";
const LABEL = "block mb-0.5 lg:mb-1 text-xs font-medium text-zinc-400 uppercase tracking-wider";

const CreateTechnician = ({
	isModalOpen,
	setIsModalOpen,
	createTechnician,
}: CreateTechnicianProps) => {
	const [name, setName] = useState("");
	const [email, setEmail] = useState("");
	const [phone, setPhone] = useState("");
	const [title, setTitle] = useState("");
	const [description, setDescription] = useState("");
	const [status] = useState<CreateTechnicianInput["status"]>("Available");
	const [hireDate, setHireDate] = useState<Date>(new Date());
	const [isLoading, setIsLoading] = useState(false);
	const [errors, setErrors] = useState<ZodError | null>(null);

	const resetForm = useCallback(() => {
		setName("");
		setEmail("");
		setPhone("");
		setTitle("");
		setDescription("");
		setHireDate(new Date());
		setErrors(null);
	}, []);

	useEffect(() => {
		if (!isModalOpen) {
			resetForm();
			setIsLoading(false);
		}
	}, [isModalOpen, resetForm]);

	const invokeCreate = async () => {
		if (isLoading) return;

		const newTechnician: CreateTechnicianInput = {
			name: name.trim(),
			email: email.trim(),
			phone: phone.trim(),
			password: "Password",
			title: title.trim(),
			description: description.trim(),
			status,
			hire_date: hireDate,
		};

		const parseResult = CreateTechnicianSchema.safeParse(newTechnician);
		if (!parseResult.success) {
			setErrors(parseResult.error);
			return;
		}

		setErrors(null);
		setIsLoading(true);
		try {
			await createTechnician(newTechnician);
			setIsModalOpen(false);
			resetForm();
		} catch (error) {
			console.error("Failed to create technician:", error);
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

	const isFormValid = useMemo(
		() => !!(name.trim() && email.trim() && phone.trim() && title.trim()),
		[name, email, phone, title]
	);

	const formContent = useMemo(
		() => (
			<div className="space-y-2 lg:space-y-3 xl:space-y-4 min-w-0">
				{/* Name */}
				<div className="min-w-0">
					<label className={LABEL}>Full Name *</label>
					<input
						type="text"
						placeholder="Full Name"
						value={name}
						onChange={(e) => setName(e.target.value)}
						className={INPUT}
						disabled={isLoading}
					/>
					<ErrorDisplay path="name" />
				</div>

				{/* Email + Phone */}
				<div className="grid grid-cols-2 gap-2 lg:gap-3 min-w-0">
					<div className="min-w-0">
						<label className={LABEL}>Email *</label>
						<input
							type="email"
							placeholder="email@example.com"
							value={email}
							onChange={(e) => setEmail(e.target.value)}
							className={INPUT}
							disabled={isLoading}
						/>
						<ErrorDisplay path="email" />
					</div>
					<div className="min-w-0">
						<label className={LABEL}>Phone *</label>
						<input
							type="tel"
							placeholder="(555) 123-4567"
							value={phone}
							onChange={(e) => setPhone(e.target.value)}
							className={INPUT}
							disabled={isLoading}
						/>
						<ErrorDisplay path="phone" />
					</div>
				</div>

				{/* Title */}
				<div className="min-w-0">
					<label className={LABEL}>Title *</label>
					<input
						type="text"
						placeholder="e.g. Senior Technician"
						value={title}
						onChange={(e) => setTitle(e.target.value)}
						className={INPUT}
						disabled={isLoading}
					/>
					<ErrorDisplay path="title" />
				</div>

				{/* Description */}
				<div className="min-w-0">
					<label className={LABEL}>Description</label>
					<textarea
						placeholder="Brief description or notes..."
						value={description}
						onChange={(e) => setDescription(e.target.value)}
						className="border border-zinc-700 px-2.5 py-1.5 lg:py-2 w-full h-14 lg:h-20 xl:h-24 rounded bg-zinc-900 text-white text-sm lg:text-base resize-none focus:border-blue-500 focus:outline-none transition-colors min-w-0"
						disabled={isLoading}
					/>
				</div>

				{/* Hire Date — half width */}
				<div className="grid grid-cols-2 gap-2 lg:gap-3 min-w-0">
					<div className="min-w-0">
						<label className={LABEL}>Hire Date</label>
						<DatePicker
							value={hireDate}
							onChange={(d) =>
								setHireDate(d ?? new Date())
							}
							disabled={isLoading}
							required
						/>
					</div>
				</div>
			</div>
		),
		[name, email, phone, title, description, hireDate, isLoading, errors]
	);

	return (
		<FormWizardContainer
			title="Create Technician"
			steps={[]}
			currentStep={1}
			visitedSteps={new Set([1])}
			isLoading={isLoading}
			isOpen={isModalOpen}
			onClose={() => setIsModalOpen(false)}
			onSubmit={invokeCreate}
			canGoNext={isFormValid}
			submitLabel="Create Technician"
		>
			{formContent}
		</FormWizardContainer>
	);
};

export default CreateTechnician;
