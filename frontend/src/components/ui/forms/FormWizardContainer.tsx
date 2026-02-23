import { useMemo } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
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
	isEditMode = false,
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

	const isNoSteps = steps.length === 0;
	const isInlineLayout = steps.length > 0 && steps.length <= 3; // 3 steps: title + stepwizard inline
	const isStackedLayout = steps.length >= 4; // 4+ steps: title on top, stepwizard beneath

	const isFirstStep = currentStep === (1 as T);
	const isLastStep = currentStep === steps[steps.length - 1]?.id;

	const sharedStepWizard = (
		<StepWizard
			steps={steps}
			currentStep={currentStep}
			visitedSteps={visitedSteps}
			isLoading={isLoading}
			canGoToStep={canGoToStep}
			onStepClick={onStepClick}
			showNavigation={false}
		/>
	);

	const sharedFooter = (
		<div className="flex items-center justify-between px-4 py-3 border-t border-zinc-700 bg-zinc-900/50 flex-shrink-0">
			<div>
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
			<div className="flex items-center gap-2">
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
				<div className="flex flex-col min-h-0 max-h-[92vh] ">
					<style>{scrollbarStyles}</style>

					{isNoSteps && (
						<>
							<div className="px-4 pt-4 pb-2 flex-shrink-0">
								<h2 className="text-xl font-bold text-white whitespace-nowrap">
									{title}
								</h2>
							</div>
							<div className="border-t border-zinc-700 mx-4 flex-shrink-0" />
							<div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden custom-scrollbar px-4 py-3">
								{children}
							</div>
							{sharedFooter}
						</>
					)}

					{isInlineLayout && (
						<>
							{/* Header: title + step wizard inline */}
							<div className="px-4 pt-4 pb-2 flex-shrink-0 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
								<h2 className="text-xl font-bold text-white whitespace-nowrap">
									{title}
								</h2>
								<div className="flex-1 sm:max-w-[60%]">
									{sharedStepWizard}
								</div>
							</div>
							<div className="border-t border-zinc-700 mx-4 flex-shrink-0" />
							<div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden custom-scrollbar px-4 py-3">
								{children}
							</div>
							{sharedFooter}
						</>
					)}

					{isStackedLayout && (
						<>
							{/* Header: title on its own row */}
							<div className="px-4 pt-4 pb-2 flex-shrink-0">
								<h2 className="text-xl font-bold text-white">
									{title}
								</h2>
							</div>
							{/* Step wizard beneath title */}
							<div className="px-4 pb-2 flex-shrink-0">
								{sharedStepWizard}
							</div>
							<div className="border-t border-zinc-700 mx-4 flex-shrink-0" />
							<div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden custom-scrollbar px-4 py-3">
								{children}
							</div>
							{sharedFooter}
						</>
					)}
				</div>
			}
		/>
	);
}
