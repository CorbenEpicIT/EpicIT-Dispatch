import { RotateCcw } from "lucide-react";

interface UndoButtonProps {
	/** Whether to show the button (typically based on isDirty state) */
	show: boolean;
	/** Callback when undo is clicked */
	onUndo: () => void;
	/** Position class for horizontal placement - adjust based on input type */
	position?: "right-2" | "right-9" | "right-16" | "right-20";
	/** Size of the icon in pixels */
	size?: number;
	/** Additional CSS classes */
	className?: string;
	/** Whether the button is disabled */
	disabled?: boolean;
}

/**
 * UndoButton - A reusable undo button for form fields
 *
 * Displays a small undo icon button positioned absolutely within a relative container.
 * Typically used inside input/textarea/select wrappers to reset field values.
 *
 * @example
 * ```tsx
 * <div className="relative">
 *   <input value={name} onChange={(e) => updateField("name", e.target.value)} />
 *   <UndoButton show={isDirty("name")} onUndo={() => undoField("name")} />
 * </div>
 * ```
 *
 * @example With custom position (for dropdowns with chevron)
 * ```tsx
 * <div className="relative">
 *   <Dropdown value={priority} onChange={updatePriority} />
 *   <UndoButton show={isDirty("priority")} onUndo={() => undoField("priority")} position="right-9" />
 * </div>
 * ```
 */
export const UndoButton = ({
	show,
	onUndo,
	position = "right-2",
	size = 16,
	className = "",
	disabled = false,
}: UndoButtonProps) => {
	if (!show) return null;

	return (
		<button
			type="button"
			title="Undo changes"
			onClick={onUndo}
			disabled={disabled}
			className={`
				absolute ${position} top-1/2 -translate-y-1/2
				text-zinc-400 hover:text-white 
				transition-colors
				disabled:opacity-50 disabled:cursor-not-allowed
				z-10
				${className}
			`.trim()}
		>
			<RotateCcw size={size} />
		</button>
	);
};

/**
 * UndoButtonTop - Variant positioned at the top (for textareas)
 */
interface UndoButtonTopProps extends Omit<UndoButtonProps, "position"> {
	/** Position class for horizontal placement */
	position?: "right-2" | "right-9" | "right-16";
}

export const UndoButtonTop = ({
	show,
	onUndo,
	position = "right-2",
	size = 16,
	className = "",
	disabled = false,
}: UndoButtonTopProps) => {
	if (!show) return null;

	return (
		<button
			type="button"
			title="Undo changes"
			onClick={onUndo}
			disabled={disabled}
			className={`
				absolute ${position} top-2
				text-zinc-400 hover:text-white 
				transition-colors
				disabled:opacity-50 disabled:cursor-not-allowed
				z-10
				${className}
			`.trim()}
		>
			<RotateCcw size={size} />
		</button>
	);
};
