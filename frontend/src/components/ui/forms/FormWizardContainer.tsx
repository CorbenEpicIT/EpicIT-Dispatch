import { useMemo } from "react";
import { ChevronLeft, ChevronRight, History } from "lucide-react";
import FullPopup from "../FullPopup";
import StepWizard from "./StepWizard";
import type { FormStep } from "../../../types/common";

interface FormWizardContainerProps<T extends number> {
	title: string;
	steps: FormStep<T>[];
	currentStep: T;
	visitedSteps: Set<T>;
	isLoading?: boolean;
	isOpen: boolean;
	onClose: () => void;
	canGoToStep?: (step: T) => boolean;
	onStepClick?: (step: T) => void;
	onNext?: () => void;
	onBack?: () => void;
	onSubmit?: () => void;
	canGoNext?: boolean;
	submitLabel?: string;
	children: React.ReactNode;
	isEditMode?: boolean;
	//Next 4: Template search handling
	fullHeightContent?: boolean;
	onStartFromExisting?: () => void;
	startFromExistingLabel?: string;
	hideStartFromExisting?: boolean;
}

export function FormWizardContainer<T extends number>({
	title,
	steps,
	currentStep,
	visitedSteps,
	isLoading = false,
	isOpen,
	onClose,
	canGoToStep,
	onStepClick,
	onNext,
	onBack,
	onSubmit,
	canGoNext,
	submitLabel,
	children,
	onStartFromExisting,
	startFromExistingLabel = "Start from existing",
	hideStartFromExisting = false,
	fullHeightContent = false,
}: FormWizardContainerProps<T>) {
	const scrollbarStyles = useMemo(
		() => `
		.custom-scrollbar::-webkit-scrollbar { width: 6px; }
		.custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
		.custom-scrollbar::-webkit-scrollbar-thumb { background-color: rgb(63 63 70); border-radius: 3px; }
		.custom-scrollbar::-webkit-scrollbar-thumb:hover { background-color: rgb(82 82 91); }
		`,
		[]
	);

	const isFirstStep = currentStep === (1 as T);
	const isLastStep = !steps.length || currentStep === steps[steps.length - 1]?.id;

	// ≤3 steps (or no steps): title + wizard side-by-side
	// 4+ steps: title above wizard
	const stacked = steps.length >= 4;

	const header = (
		<div
			className={`px-4 sm:px-5 pt-4 pb-3 flex-shrink-0 ${
				stacked
					? "space-y-2"
					: "flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-3"
			}`}
		>
			<h2 className="text-lg sm:text-xl font-bold text-white whitespace-nowrap flex-shrink-0">
				{title}
			</h2>
			{steps.length > 0 && (
				<div className={stacked ? "w-full" : "flex-1 sm:max-w-[60%]"}>
					<StepWizard
						steps={steps}
						currentStep={currentStep}
						visitedSteps={visitedSteps}
						isLoading={isLoading}
						canGoToStep={canGoToStep}
						onStepClick={onStepClick}
						showNavigation={false}
					/>
				</div>
			)}
		</div>
	);

	const footer = (
		<div className="flex items-center justify-between px-4 pt-3 pb-4 border-t border-zinc-700 bg-zinc-900 flex-shrink-0">
			<div className="flex-1 flex justify-start">
				{!isFirstStep && onBack && (
					<button
						type="button"
						onClick={onBack}
						disabled={isLoading}
						className="flex items-center gap-1 px-3 py-1.5 text-sm text-zinc-300 hover:text-white hover:bg-zinc-800 rounded transition-colors disabled:opacity-50"
					>
						<ChevronLeft size={16} />
						Back
					</button>
				)}
			</div>

			<div className="flex-1 flex justify-center">
				{onStartFromExisting && !hideStartFromExisting && (
					<button
						type="button"
						onClick={onStartFromExisting}
						disabled={isLoading}
						className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 border border-zinc-700 hover:border-zinc-600 rounded transition-colors disabled:opacity-50"
					>
						<History size={13} />
						{startFromExistingLabel}
					</button>
				)}
			</div>

			<div className="flex-1 flex justify-end items-center gap-2">
				<button
					type="button"
					onClick={onClose}
					disabled={isLoading}
					className="px-3 py-1.5 text-sm text-zinc-400 hover:text-white hover:bg-zinc-800 rounded transition-colors disabled:opacity-50"
				>
					Cancel
				</button>
				{!isLastStep && onNext ? (
					<button
						type="button"
						onClick={onNext}
						disabled={!canGoNext || isLoading}
						className="flex items-center gap-1 px-4 py-1.5 text-sm bg-blue-600 hover:bg-blue-700 disabled:bg-zinc-700 disabled:text-zinc-400 text-white rounded font-medium transition-colors"
					>
						Next
						<ChevronRight size={16} />
					</button>
				) : onSubmit ? (
					<button
						type="button"
						onClick={onSubmit}
						disabled={isLoading}
						className={`flex items-center gap-2 px-4 py-1.5 text-sm rounded font-bold transition-colors ${
							isLoading
								? "bg-green-700 text-green-100 cursor-wait"
								: "bg-green-600 hover:bg-green-700 text-white"
						}`}
					>
						{isLoading
							? "Processing..."
							: submitLabel || "Submit"}
					</button>
				) : null}
			</div>
		</div>
	);

	return (
		<FullPopup
			isModalOpen={isOpen}
			onClose={onClose}
			content={
				<div className="flex flex-col min-h-0 flex-1">
					<style>{scrollbarStyles}</style>
					{header}
					<div className="border-t border-zinc-700 mx-4 flex-shrink-0" />
					<div
						className={`flex-1 min-h-0 ${fullHeightContent ? "flex flex-col" : "overflow-y-auto overflow-x-hidden custom-scrollbar"}`}
					>
						{fullHeightContent ? (
							<div className="px-4 sm:px-5 pt-3 sm:pt-4 flex flex-col min-h-0">
								{children}
							</div>
						) : (
							<div className="px-4 pt-3 sm:px-5 sm:pt-4 pb-4">
								{children}
							</div>
						)}
					</div>
					{footer}
				</div>
			}
		/>
	);
}
