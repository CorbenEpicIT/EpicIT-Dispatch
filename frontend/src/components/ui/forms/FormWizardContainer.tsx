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

	const isThreeSteps = steps.length === 3;
	const isFirstStep = currentStep === (1 as T);
	const isLastStep = currentStep === steps[steps.length - 1]?.id;

	return (
		<FullPopup
			isModalOpen={isOpen}
			onClose={onClose}
			content={
				<div className="flex flex-col max-h-[85vh] h-full">
					<style>{scrollbarStyles}</style>

					{/* 3-step layout */}
					{isThreeSteps ? (
						<>
							<div className="px-5 pt-5 flex-shrink-0 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
								<h2 className="text-2xl font-bold text-white whitespace-nowrap mt-6">
									{title}
								</h2>
								<div className="flex-1 sm:max-w-[60%]">
									<StepWizard
										steps={steps}
										currentStep={
											currentStep
										}
										visitedSteps={
											visitedSteps
										}
										isLoading={
											isLoading
										}
										canGoToStep={
											canGoToStep
										}
										onStepClick={
											onStepClick
										}
										showNavigation={
											false
										}
										isEditMode={
											isEditMode
										}
									>
										{null}
									</StepWizard>
								</div>
							</div>
							<div className="border-t border-zinc-700 my-2" />
							<div className="flex-1 overflow-y-auto custom-scrollbar px-5 py-4">
								{children}
							</div>
							<div className="flex items-center justify-between px-5 py-4 border-t border-zinc-700 bg-zinc-900/50">
								<div>
									{!isFirstStep && onBack && (
										<button
											type="button"
											onClick={
												onBack
											}
											disabled={
												isLoading
											}
											className="flex items-center gap-1 px-4 py-2 text-zinc-300 hover:text-white hover:bg-zinc-800 rounded-md transition-colors disabled:opacity-50"
										>
											<ChevronLeft
												size={
													18
												}
											/>
											Back
										</button>
									)}
								</div>
								<div className="flex items-center gap-2">
									<button
										type="button"
										onClick={onClose}
										disabled={isLoading}
										className="px-4 py-2 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-md transition-colors disabled:opacity-50"
									>
										Cancel
									</button>
									{!isLastStep && onNext ? (
										<button
											type="button"
											onClick={
												onNext
											}
											disabled={
												!canGoNext ||
												isLoading
											}
											className="flex items-center gap-1 px-5 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-zinc-700 disabled:text-zinc-400 text-white rounded-md font-medium transition-colors"
										>
											Next
											<ChevronRight
												size={
													18
												}
											/>
										</button>
									) : onSubmit ? (
										<button
											type="button"
											onClick={
												onSubmit
											}
											disabled={
												isLoading
											}
											className={`flex items-center gap-2 px-5 py-2 rounded-md font-bold transition-colors ${isLoading ? "bg-green-700 text-green-100 cursor-wait" : "bg-green-600 hover:bg-green-700 text-white"}`}
										>
											{isLoading
												? "Processing..."
												: submitLabel ||
													"Submit"}
										</button>
									) : null}
								</div>
							</div>
						</>
					) : (
						/* 4+ step layout */
						<>
							<div className="px-5 pt-5 flex-shrink-0">
								<h2 className="text-2xl font-bold text-white mb-4">
									{title}
								</h2>
							</div>
							<StepWizard
								steps={steps}
								currentStep={currentStep}
								visitedSteps={visitedSteps}
								isLoading={isLoading}
								canGoToStep={canGoToStep}
								onStepClick={onStepClick}
								onNext={onNext}
								onBack={onBack}
								onCancel={onClose}
								onSubmit={onSubmit}
								canGoNext={canGoNext}
								submitLabel={submitLabel}
								isEditMode={isEditMode}
							>
								{children}
							</StepWizard>
						</>
					)}
				</div>
			}
		/>
	);
}
