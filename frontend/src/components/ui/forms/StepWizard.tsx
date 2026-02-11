import { Check, Lock, ChevronLeft, ChevronRight } from "lucide-react";
import { useMemo } from "react";
import type { FormStep } from "../../../types/common";

export interface StepWizardProps<T extends number> {
	steps: FormStep<T>[];
	currentStep: T;
	visitedSteps: Set<T>;
	isLoading?: boolean;
	canGoToStep?: (step: T) => boolean;
	onStepClick?: (step: T) => void;
	onNext?: () => void;
	onBack?: () => void;
	onCancel?: () => void;
	onSubmit?: () => void;
	canGoNext?: boolean;
	submitLabel?: string;
	cancelLabel?: string;
	nextLabel?: string;
	backLabel?: string;
	showNavigation?: boolean;
	children?: React.ReactNode;
}

const StepWizard = <T extends number>({
	steps,
	currentStep,
	visitedSteps,
	isLoading = false,
	canGoToStep = () => true,
	onStepClick,
	onNext,
	onBack,
	onCancel,
	onSubmit,
	canGoNext = true,
	submitLabel = "Submit",
	cancelLabel = "Cancel",
	nextLabel = "Next",
	backLabel = "Back",
	showNavigation = true,
	children,
}: StepWizardProps<T>) => {
	const isFirstStep = currentStep === (1 as T);
	const isLastStep = currentStep === steps[steps.length - 1]?.id;

	const stepStates = useMemo(() => {
		return steps.map((step, index) => {
			const isCurrent = currentStep === step.id;
			const isCompleted = currentStep > step.id;
			const isAccessible = canGoToStep(step.id);
			const isLocked = !isAccessible && !isCompleted;
			const isPending =
				visitedSteps.has(step.id) && step.id > currentStep && !isCompleted;

			return {
				...step,
				isCurrent,
				isCompleted,
				isAccessible,
				isLocked,
				isPending,
				isLast: index === steps.length - 1,
			};
		});
	}, [steps, currentStep, visitedSteps, canGoToStep]);

	const getStepStyles = (state: (typeof stepStates)[0]) => {
		if (state.isCurrent)
			return "bg-blue-600 border-blue-600 text-white shadow-lg shadow-blue-900/50";
		if (state.isCompleted)
			return "bg-green-600 border-green-600 text-white hover:bg-green-500";
		if (state.isPending)
			return "bg-yellow-500 border-yellow-500 text-zinc-900 hover:bg-yellow-400 font-bold";
		if (state.isAccessible && !state.isCompleted && !state.isCurrent)
			return "bg-zinc-900 border-zinc-800 text-zinc-600 hover:bg-zinc-800 hover:text-zinc-400";
		return "bg-zinc-900 border-zinc-800 text-zinc-600";
	};

	const getLabelColor = (state: (typeof stepStates)[0]) => {
		if (state.isCurrent) return "text-white";
		if (state.isCompleted) return "text-green-400";
		if (state.isPending) return "text-yellow-400";
		return "text-zinc-600";
	};

	const getLineColor = (index: number) => {
		if (index >= steps.length - 1) return "";
		const nextState = stepStates[index + 1];
		if (!nextState) return "bg-zinc-800";
		if (nextState.isCompleted) return "bg-green-600";
		if (nextState.isCurrent) return "bg-blue-600";
		if (nextState.isPending) return "bg-yellow-500";
		return "bg-zinc-800";
	};

	const getCursorStyle = (state: (typeof stepStates)[0]) => {
		if (isLoading) return "cursor-not-allowed";
		if (state.isLocked) return "cursor-not-allowed";
		if (state.isCurrent) return "cursor-default";
		if (state.isAccessible) return "cursor-pointer";
		return "cursor-not-allowed";
	};

	return (
		<div className="w-full flex flex-col h-full">
			{/* Progress Indicator */}
			<div className="w-full px-4 py-2">
				<div className="flex items-center justify-center">
					{stepStates.map((state, index) => (
						<div
							key={state.id}
							className="flex items-center justify-center flex-initial"
						>
							<div className="flex flex-col items-center flex-shrink-0">
								<button
									type="button"
									onClick={() =>
										!state.isLocked &&
										onStepClick?.(
											state.id
										)
									}
									disabled={
										state.isLocked ||
										isLoading
									}
									className={`
										flex items-center justify-center w-9 h-9 rounded-full text-sm font-semibold 
										transition-all duration-300 border-2 flex-shrink-0
										${getStepStyles(state)}
										${getCursorStyle(state)}
										${(state.isLocked || isLoading) && "opacity-50"}
									`}
								>
									{state.isCompleted ? (
										<Check
											size={16}
											strokeWidth={
												3
											}
										/>
									) : state.isLocked ? (
										<Lock size={12} />
									) : (
										state.id
									)}
								</button>
								<span
									className={`
										mt-2 text-xs font-medium transition-colors duration-300 
										whitespace-nowrap overflow-hidden text-ellipsis max-w-[80px]
										${getLabelColor(state)}
									`}
									title={state.label}
								>
									{state.label}
								</span>
							</div>

							{!state.isLast && (
								<div className="flex-1 h-0.5 mx-4 mb-6 min-w-[2rem]">
									<div
										className={`h-full w-full ${getLineColor(index)} transition-colors duration-500`}
									/>
								</div>
							)}
						</div>
					))}
				</div>
			</div>

			{/* Content Area */}
			{children && (
				<div className="flex-1 overflow-y-auto custom-scrollbar px-5 py-4">
					{children}
				</div>
			)}

			{/* Navigation Footer */}
			{showNavigation && (
				<div className="flex items-center justify-between px-5 py-4 border-t border-zinc-700 bg-zinc-900/50">
					<div>
						{!isFirstStep && onBack && (
							<button
								type="button"
								onClick={onBack}
								disabled={isLoading}
								className="flex items-center gap-1 px-4 py-2 text-zinc-300 hover:text-white hover:bg-zinc-800 rounded-md transition-colors disabled:opacity-50"
							>
								<ChevronLeft size={18} />
								{backLabel}
							</button>
						)}
					</div>

					<div className="flex items-center gap-2">
						{onCancel && (
							<button
								type="button"
								onClick={onCancel}
								disabled={isLoading}
								className="px-4 py-2 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-md transition-colors disabled:opacity-50"
							>
								{cancelLabel}
							</button>
						)}

						{!isLastStep && onNext ? (
							<button
								type="button"
								onClick={onNext}
								disabled={!canGoNext || isLoading}
								className="flex items-center gap-1 px-5 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-zinc-700 disabled:text-zinc-400 text-white rounded-md font-medium transition-colors"
							>
								{nextLabel}
								<ChevronRight size={18} />
							</button>
						) : onSubmit ? (
							<button
								type="button"
								onClick={onSubmit}
								disabled={isLoading}
								className={`
									flex items-center gap-2 px-5 py-2 rounded-md font-bold transition-colors
									${
										isLoading
											? "bg-green-700 text-green-100 cursor-wait"
											: "bg-green-600 hover:bg-green-700 text-white"
									}
								`}
							>
								{isLoading ? (
									<>
										<svg
											className="animate-spin h-4 w-4"
											xmlns="http://www.w3.org/2000/svg"
											fill="none"
											viewBox="0 0 24 24"
										>
											<circle
												className="opacity-25"
												cx="12"
												cy="12"
												r="10"
												stroke="currentColor"
												strokeWidth="4"
											/>
											<path
												className="opacity-75"
												fill="currentColor"
												d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
											/>
										</svg>
										Processing...
									</>
								) : (
									submitLabel
								)}
							</button>
						) : null}
					</div>
				</div>
			)}
		</div>
	);
};

export default StepWizard;
