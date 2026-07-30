import { useCallback, useEffect, useRef, useState } from "react";
import { Check } from "lucide-react";
import type {
	FollowupEnrollmentStatus,
	FollowupTriggerType,
	FollowupStepCondition,
} from "../../types/followups";
import {
	FollowupEnrollmentStatusLabels,
	FollowupTriggerTypeLabels,
	FollowupStepConditionLabels,
} from "../../types/followups";

// ============================================================================
// SHARED STYLE PRIMITIVES — mirrors CreateClient.tsx's LABEL/INPUT pattern,
// used across the modal forms in this feature.
// ============================================================================

export const LABEL =
	"block mb-0.5 text-xs font-medium text-text-tertiary uppercase tracking-wider";

export const INPUT =
	"border border-border px-2.5 h-[34px] w-full rounded bg-base text-text-primary text-sm focus:border-primary focus:outline-none transition-colors";

export const TEXTAREA =
	"border border-border px-2.5 py-2 w-full rounded bg-base text-text-primary text-sm focus:border-primary focus:outline-none transition-colors resize-none";

// ============================================================================
// TOGGLE — matches the pill switch used in SettingsSection.tsx
// ============================================================================

interface ToggleProps {
	checked: boolean;
	onChange: () => void;
	label: string;
	description?: string;
}

export function Toggle({ checked, onChange, label, description }: ToggleProps) {
	return (
		<label className="flex cursor-pointer items-start gap-2.5" onClick={onChange}>
			<div
				className={`relative mt-0.5 h-4 w-7 flex-shrink-0 rounded-full border transition-colors ${
					checked ? "border-primary bg-primary" : "border-border bg-surface-inset"
				}`}
			>
				<span
					className={`absolute top-0.5 h-3 w-3 rounded-full bg-white transition-transform ${
						checked ? "translate-x-3" : "translate-x-0.5"
					}`}
				/>
			</div>
			<span>
				<span className="block text-xs font-medium text-text-primary">{label}</span>
				{description && <span className="block text-xs text-text-muted">{description}</span>}
			</span>
		</label>
	);
}

// ============================================================================
// CHECKBOX — matches TaxSettingsSection.tsx's inline checkbox
// ============================================================================

interface CheckboxProps {
	checked: boolean;
	onChange: () => void;
	label: string;
}

export function Checkbox({ checked, onChange, label }: CheckboxProps) {
	return (
		<label className="flex cursor-pointer items-center gap-2.5">
			<input type="checkbox" checked={checked} onChange={onChange} className="sr-only" />
			<div
				aria-hidden="true"
				className={`flex h-4 w-4 flex-shrink-0 items-center justify-center rounded border transition-colors ${
					checked ? "border-primary bg-primary" : "border-border bg-surface hover:border-border-strong"
				}`}
			>
				{checked && <Check size={10} className="text-white" strokeWidth={3} />}
			</div>
			<span className="text-xs text-text-secondary">{label}</span>
		</label>
	);
}

// ============================================================================
// BADGES
// ============================================================================

export function ActiveBadge({ active }: { active: boolean }) {
	return active ? (
		<span className="inline-flex items-center rounded-full border border-success-border bg-success-bg px-2 py-0.5 text-xs font-medium text-success-text">
			Active
		</span>
	) : (
		<span className="inline-flex items-center rounded-full border border-border bg-surface px-2 py-0.5 text-xs font-medium text-text-muted">
			Inactive
		</span>
	);
}

const ENROLLMENT_STATUS_CLASSES: Record<FollowupEnrollmentStatus, string> = {
	active: "border-primary-border bg-primary-bg text-primary-text",
	completed: "border-success-border bg-success-bg text-success-text",
	stopped: "border-border bg-surface text-text-muted",
	failed: "border-error-border bg-error-bg text-error-text",
};

export function EnrollmentStatusBadge({ status }: { status: FollowupEnrollmentStatus }) {
	return (
		<span
			className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${ENROLLMENT_STATUS_CLASSES[status]}`}
		>
			{FollowupEnrollmentStatusLabels[status]}
		</span>
	);
}

export function OpenedBadge() {
	return (
		<span className="inline-flex items-center rounded-full border border-success-border bg-success-bg px-2 py-0.5 text-xs font-medium text-success-text">
			Opened
		</span>
	);
}

export function TriggerTypeLabel({ type }: { type: FollowupTriggerType }) {
	return <>{FollowupTriggerTypeLabels[type]}</>;
}

export function StepConditionLabel({ condition }: { condition: FollowupStepCondition }) {
	return <>{FollowupStepConditionLabels[condition]}</>;
}

// ============================================================================
// INLINE FEEDBACK — mirrors TaxSettingsSection.tsx's useFeedback hook
// ============================================================================

interface FeedbackState {
	type: "success" | "error";
	message: string;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useFeedback() {
	const [feedback, setFeedback] = useState<FeedbackState | null>(null);
	const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	useEffect(() => {
		return () => {
			if (timerRef.current) clearTimeout(timerRef.current);
		};
	}, []);

	const showFeedback = useCallback((type: "success" | "error", message: string) => {
		if (timerRef.current) clearTimeout(timerRef.current);
		setFeedback({ type, message });
		timerRef.current = setTimeout(() => setFeedback(null), 3000);
	}, []);

	return { feedback, showFeedback };
}

export function FeedbackBanner({ feedback }: { feedback: FeedbackState | null }) {
	if (!feedback) return null;
	return (
		<div
			className={`border-b border-border-subtle px-5 py-2 text-xs ${
				feedback.type === "success" ? "text-success-text" : "text-error-text"
			}`}
		>
			{feedback.message}
		</div>
	);
}
