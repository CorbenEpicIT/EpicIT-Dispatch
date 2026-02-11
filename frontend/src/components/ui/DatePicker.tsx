import { useState, useRef, useEffect } from "react";
import { DayPicker } from "react-day-picker";
import { Calendar, X, RotateCcw } from "lucide-react";
import { format } from "date-fns";
import "react-day-picker/dist/style.css";

type DatePickerProps = {
	value: Date | null;
	onChange: (date: Date | null) => void;
	required?: boolean;
	disabled?: boolean;
	mode?: "create" | "edit";
	originalValue?: Date | null;
	onClear?: () => void;
	align?: "left" | "right";
	position?: "above" | "below" | "auto";
};

export default function DatePicker({
	value,
	onChange,
	required = false,
	disabled,
	mode = "create",
	originalValue,
	onClear,
	align = "left",
	position = "auto",
}: DatePickerProps) {
	const [open, setOpen] = useState(false);
	const [ready, setReady] = useState(false);
	const [calculatedPosition, setCalculatedPosition] = useState<"above" | "below">("below");

	const buttonRef = useRef<HTMLButtonElement>(null);
	const calendarRef = useRef<HTMLDivElement>(null);

	const isEdit = mode === "edit";
	const hasOriginal = originalValue !== undefined && originalValue !== null;
	const isDirty = isEdit && hasOriginal && value?.getTime() !== originalValue?.getTime();

	useEffect(() => {
		if (!open) {
			setReady(false);
			return;
		}

		if (position === "auto") {
			// Calculate based on available space
			const CAL_H = 350;
			const rect = buttonRef.current!.getBoundingClientRect();
			const hasSpaceBelow = window.innerHeight - rect.bottom >= CAL_H;
			setCalculatedPosition(hasSpaceBelow ? "below" : "above");
		}

		requestAnimationFrame(() => setReady(true));
	}, [open, position]);

	useEffect(() => {
		if (!open) return;
		const handler = (e: MouseEvent) => {
			const inBtn = buttonRef.current?.contains(e.target as Node);
			const inCal = calendarRef.current?.contains(e.target as Node);
			if (!inBtn && !inCal) setOpen(false);
		};
		document.addEventListener("click", handler, true);
		return () => document.removeEventListener("click", handler, true);
	}, [open]);

	useEffect(() => {
		const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
		const onScroll = () => setOpen(false);
		window.addEventListener("keydown", onKey);
		window.addEventListener("scroll", onScroll, true);
		return () => {
			window.removeEventListener("keydown", onKey);
			window.removeEventListener("scroll", onScroll, true);
		};
	}, [open]);

	const handleClear = (e: React.MouseEvent) => {
		e.stopPropagation();
		onChange(null);
		onClear?.();
		setOpen(false);
	};

	const handleUndo = (e: React.MouseEvent) => {
		e.stopPropagation();
		if (originalValue !== undefined) {
			onChange(originalValue);
			setOpen(false);
		}
	};

	const finalPosition = position === "auto" ? calculatedPosition : position;

	const popupClasses = `
    absolute z-50 bg-zinc-950 border border-zinc-700
    rounded-sm shadow-xl p-0.5
    ${finalPosition === "above" ? "bottom-full mb-1" : "top-full mt-1"}
    ${align === "left" ? "left-0" : "right-0"}
  `;

	return (
		<div className="relative w-full">
			<style>{`
        .date-picker-dark {
          --rdp-accent-color: #3b82f6;
          --rdp-background-color: #18181b;
          --rdp-accent-background-color: #1e40af;
          color: #e4e4e7;
          border-radius: 4px;
          pointer-events: auto !important;
          overscroll-behavior: contain;
        }
        .date-picker-dark .rdp-month_caption {
          color: #e4e4e7;
          font-weight: 600;
          padding: 0 0 0 0.8rem;
          margin-bottom: 0.25rem;
          font-size: 1rem;
        }
        .date-picker-dark .rdp-weekdays { padding: 0 0.25rem; }
        .date-picker-dark .rdp-weekday {
          color: #a1a1aa;
          font-size: 0.7rem;
          padding: 0.05rem 0.25rem;
        }
        .date-picker-dark .rdp-day_button {
          padding: 0.15rem;
          border-radius: 3px;
          font-size: 0.8rem;
          line-height: 1rem;
        }
        .date-picker-dark .rdp-day_button:hover:not([disabled]):not(.rdp-day_selected) {
          background-color: #27272a;
        }
        .date-picker-dark .rdp-day_button.rdp-day_selected {
          background-color: #3b82f6;
          color: white;
        }
        .date-picker-dark .rdp-day_button.rdp-day_today:not(.rdp-day_selected) {
          color: #3b82f6;
          font-weight: 600;
        }
        .date-picker-dark .rdp-day_button:disabled { opacity: 0.25; }
        .date-picker-dark .rdp-nav_button {
          padding: 0.2rem;
          border-radius: 4px;
          color: #e4e4e7;
        }
        .date-picker-dark .rdp-nav_button:hover { background-color: #27272a; }
      `}</style>

			<button
				ref={buttonRef}
				type="button"
				disabled={disabled}
				onClick={() => setOpen((o) => !o)}
				className="border border-zinc-700 bg-zinc-900 p-2 w-full rounded-sm text-left flex items-center justify-between
                   hover:border-zinc-600 focus:border-blue-500 focus:outline-none transition-colors
                   disabled:opacity-60 disabled:cursor-not-allowed"
			>
				<span className={!value ? "text-zinc-500" : "text-white"}>
					{!value ? "Select date..." : format(value, "MMMM dd, yyyy")}
				</span>

				<div className="flex items-center gap-1">
					{/* Undo: shown when editing and dirty (regardless of required) */}
					{isEdit && isDirty && !disabled && (
						<span
							onClick={handleUndo}
							title="Undo"
							className="hover:bg-zinc-800 rounded p-0.5 transition-colors cursor-pointer inline-flex"
						>
							<RotateCcw className="h-3 w-3 text-zinc-400 hover:text-white" />
						</span>
					)}

					{/* Clear: shown when NOT required, has value, and not disabled */}
					{!required && value && !disabled && (
						<span
							onClick={handleClear}
							title="Clear"
							className="hover:bg-zinc-800 rounded p-0.5 transition-colors cursor-pointer inline-flex"
						>
							<X className="h-3 w-3 text-zinc-400 hover:text-white" />
						</span>
					)}

					<Calendar className="h-4 w-4 text-white opacity-50" />
				</div>
			</button>

			{open && ready && (
				<div ref={calendarRef} className={popupClasses}>
					<DayPicker
						mode="single"
						selected={value || undefined}
						onSelect={(date) => {
							onChange(date ?? null);
							setOpen(false);
						}}
						className="date-picker-dark"
					/>
				</div>
			)}
		</div>
	);
}
