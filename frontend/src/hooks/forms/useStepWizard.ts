import { useState, useCallback } from "react";

interface UseStepWizardOptions<T extends number> {
	totalSteps: T;
	initialStep?: T;
}

export const useStepWizard = <T extends number>({
	totalSteps,
	initialStep = 1 as T,
}: UseStepWizardOptions<T>) => {
	const [currentStep, setCurrentStep] = useState<T>(initialStep);
	const [visitedSteps, setVisitedSteps] = useState<Set<T>>(new Set([initialStep]));

	const goNext = useCallback(() => {
		if (currentStep < totalSteps) {
			const nextStep = (currentStep + 1) as T;
			setCurrentStep(nextStep);
			setVisitedSteps((prev) => new Set([...Array.from(prev), nextStep]));
		}
	}, [currentStep, totalSteps]);

	const goBack = useCallback(() => {
		if (currentStep > (1 as T)) {
			setCurrentStep((currentStep - 1) as T);
		}
	}, [currentStep]);

	const goToStep = useCallback((targetStep: T) => {
		setCurrentStep(targetStep);
		setVisitedSteps((prev) => {
			const newSet = new Set(prev);
			// Mark all steps up to and including target as visited
			for (let i = 1; i <= targetStep; i++) {
				newSet.add(i as T);
			}
			return newSet;
		});
	}, []);

	const reset = useCallback(() => {
		setCurrentStep(initialStep);
		setVisitedSteps(new Set([initialStep]));
	}, [initialStep]);

	// Drop visited markers that no longer make sense. Used when the step set
	// itself changes shape (e.g. an inserted/removed step renumbers later ids):
	// a step id that was visited under the old layout can point at a different
	// step under the new one, so its stale "seen" flag must be pruned.
	const pruneVisited = useCallback((keep: (step: T) => boolean) => {
		setVisitedSteps((prev) => new Set(Array.from(prev).filter(keep)));
	}, []);

	return {
		currentStep,
		visitedSteps,
		goNext,
		goBack,
		goToStep,
		reset,
		pruneVisited,
	};
};
