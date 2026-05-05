import { useState, useRef, useEffect } from "react";
import { Calendar, ChevronDown, Check, X } from "lucide-react";
import { DayPicker } from "react-day-picker";
import { useSearchParams } from "react-router-dom";
import { format } from "date-fns";
import "react-day-picker/dist/style.css";
import {
	type DateRangeOption,
	type DateRangeValue,
	formatTriggerLabel,
	parseDateRangeFromParams,
	serializeDateRange,
} from "../../util/dateRangeUtils";

interface DateRangeFilterUrlProps {
	paramKey: string;
}

interface DateRangeFilterControlledProps {
	value: DateRangeValue;
	onChange: (value: DateRangeValue) => void;
}

type DateRangeFilterProps = DateRangeFilterUrlProps | DateRangeFilterControlledProps;

const PRESET_OPTIONS: { value: DateRangeOption; label: string }[] = [
	{ value: "all", label: "All" },
	{ value: "today", label: "Today" },
	{ value: "last_7_days", label: "Last 7 days" },
	{ value: "last_30_days", label: "Last 30 days" },
	{ value: "this_month", label: "This month" },
	{ value: "custom", label: "Custom range" },
];

export default function DateRangeFilter(props: DateRangeFilterProps) {
	if ("paramKey" in props) {
		return <UrlDateRangeFilter {...props} />;
	}
	return <DateRangeDropdown {...props} />;
}

function UrlDateRangeFilter({ paramKey }: DateRangeFilterUrlProps) {
	const [searchParams, setSearchParams] = useSearchParams();
	const value = parseDateRangeFromParams(searchParams, paramKey);

	const handleChange = (newValue: DateRangeValue) => {
		setSearchParams((prev) => serializeDateRange(newValue, paramKey, prev));
	};

	return <DateRangeDropdown value={value} onChange={handleChange} />;
}

function DateRangeDropdown({ value, onChange }: DateRangeFilterControlledProps) {
	const [open, setOpen] = useState(false);
	const [openAbove, setOpenAbove] = useState(false);
	const [editingField, setEditingField] = useState<"start" | "end" | null>(null);
	const [calendarPos, setCalendarPos] = useState<{ top?: number; bottom?: number; left?: number; right?: number } | null>(null);

	const containerRef = useRef<HTMLDivElement>(null);
	const calendarRef = useRef<HTMLDivElement>(null);
	const triggerRef = useRef<HTMLButtonElement>(null);
	const startBoxRef = useRef<HTMLDivElement>(null);
	const endBoxRef = useRef<HTMLDivElement>(null);

	const [tempOption, setTempOption] = useState<DateRangeOption>("all");
	const [tempStart, setTempStart] = useState<Date | undefined>(undefined);
	const [tempEnd, setTempEnd] = useState<Date | undefined>(undefined);

	const isActive = value.option !== "all";

	useEffect(() => {
		if (!open) return;
		const onDown = (e: MouseEvent) => {
			const inContainer = containerRef.current?.contains(e.target as Node);
			const inCalendar = calendarRef.current?.contains(e.target as Node);
			if (!inContainer && !inCalendar) {
				setOpen(false);
				setEditingField(null);
				setCalendarPos(null);
			}
		};
		const onKey = (e: KeyboardEvent) => {
			if (e.key === "Escape") {
				if (editingField !== null) {
					setEditingField(null);
					setCalendarPos(null);
				} else {
					setOpen(false);
				}
			}
		};
		document.addEventListener("mousedown", onDown);
		document.addEventListener("keydown", onKey);
		return () => {
			document.removeEventListener("mousedown", onDown);
			document.removeEventListener("keydown", onKey);
		};
	}, [open, editingField]);

	const handleOpen = () => {
		if (!open) {
			const today = new Date();
			setTempOption(value.option);
			setTempStart(value.startDate ?? today);
			setTempEnd(value.endDate ?? today);
			setEditingField(null);
			setCalendarPos(null);

			if (triggerRef.current) {
				const rect = triggerRef.current.getBoundingClientRect();
				setOpenAbove(rect.bottom + 280 > window.innerHeight - 16);
			}
		}
		setOpen((o) => !o);
	};

	const handlePresetClick = (option: DateRangeOption) => {
		if (option === "custom") {
			setTempOption("custom");
		} else {
			onChange({ option });
			setOpen(false);
			setEditingField(null);
			setCalendarPos(null);
		}
	};

	const handleFieldClick = (field: "start" | "end") => {
		setEditingField((prev) => (prev === field ? null : field));
		const ref = field === "start" ? startBoxRef : endBoxRef;
		if (ref.current) {
			const rect = ref.current.getBoundingClientRect();
			const CALENDAR_HEIGHT = 240;
			const openAbove = window.innerHeight - rect.bottom - 4 < CALENDAR_HEIGHT;
			const pos =
				field === "start"
					? openAbove
						? { bottom: window.innerHeight - rect.top + 4, left: rect.left }
						: { top: rect.bottom + 4, left: rect.left }
					: openAbove
						? { bottom: window.innerHeight - rect.top + 4, right: window.innerWidth - rect.right }
						: { top: rect.bottom + 4, right: window.innerWidth - rect.right };
			setCalendarPos(editingField === field ? null : pos);
		}
	};

	const handleCalendarSelect = (date: Date | undefined) => {
		if (editingField === "start") {
			setTempStart(date);
		} else {
			setTempEnd(date);
		}
		setEditingField(null);
		setCalendarPos(null);
	};

	const handleApply = () => {
		if (!tempStart || !tempEnd) return;
		const start = tempStart <= tempEnd ? tempStart : tempEnd;
		const end = tempStart <= tempEnd ? tempEnd : tempStart;
		onChange({ option: "custom", startDate: start, endDate: end });
		setOpen(false);
		setEditingField(null);
		setCalendarPos(null);
	};

	const isOptionHighlighted = (option: DateRangeOption): boolean => {
		if (option === "custom") return tempOption === "custom";
		return value.option === option && tempOption !== "custom";
	};

	const calendarSelected = editingField === "start" ? tempStart : tempEnd;

	return (
		<div className="relative" ref={containerRef}>
			<style>{DAY_PICKER_DARK_CSS}</style>
			<button
				ref={triggerRef}
				type="button"
				onClick={handleOpen}
				aria-expanded={open}
				aria-haspopup="listbox"
				className={`flex items-center gap-1.5 h-9 px-3 rounded-md border text-sm transition-colors cursor-pointer whitespace-nowrap ${
					isActive
						? "bg-blue-950 border-blue-500 text-blue-300"
						: "bg-zinc-800 border-zinc-700 text-zinc-400 hover:text-white"
				}`}
			>
				<Calendar size={14} className="shrink-0" />
				<span>{isActive ? `Date: ${formatTriggerLabel(value)}` : "Date"}</span>
				{isActive ? (
					<X
						size={14}
						className="shrink-0"
						onClick={(e) => {
							e.stopPropagation();
							onChange({ option: "all" });
						}}
					/>
				) : (
					<ChevronDown size={14} className="shrink-0" />
				)}
			</button>

			{open && (
				<div
					role="listbox"
					aria-label="Date range"
					className={`absolute right-0 bg-zinc-950 border border-zinc-600 rounded-lg shadow-2xl shadow-black/50 z-50 overflow-hidden ${
						openAbove ? "bottom-full mb-1.5" : "top-full mt-1.5"
					} ${tempOption === "custom" ? "w-72" : "w-44"}`}
				>
					<div className="py-1 px-1">
						{PRESET_OPTIONS.map((option) => (
							<button
								type="button"
								key={option.value}
								role="option"
								aria-selected={isOptionHighlighted(option.value)}
								onClick={() => handlePresetClick(option.value)}
								className={`w-full flex items-center justify-between px-3 py-1.5 text-sm cursor-pointer rounded text-left ${
									isOptionHighlighted(option.value)
										? "bg-blue-950/60 text-blue-300"
										: "text-zinc-300 hover:bg-zinc-800/70"
								}`}
							>
								<span>{option.label}</span>
								{option.value !== "custom" && isOptionHighlighted(option.value) && (
									<Check size={14} />
								)}
							</button>
						))}
					</div>

					{tempOption === "custom" && (
						<div className="border-t border-zinc-700 px-3 py-3">
							<div className="grid grid-cols-2 gap-2 mb-3">
								{/* Start box */}
								<div
									ref={startBoxRef}
									onClick={() => handleFieldClick("start")}
									className={`flex items-center justify-between px-2.5 py-2 rounded-md border cursor-pointer transition-colors ${
										editingField === "start"
											? "border-blue-500 bg-zinc-900"
											: "border-zinc-700 bg-zinc-900 hover:border-zinc-600"
									}`}
								>
									<div className="min-w-0 flex-1">
										<p className="text-xs text-zinc-400 mb-0.5">Start time</p>
										<p className="text-xs text-white">
											{tempStart ? format(tempStart, "MMM d, yyyy") : "—"}
										</p>
									</div>
									<Calendar size={13} className="shrink-0 ml-1.5 text-zinc-500" />
								</div>

								{/* End box */}
								<div
									ref={endBoxRef}
									onClick={() => handleFieldClick("end")}
									className={`flex items-center justify-between px-2.5 py-2 rounded-md border cursor-pointer transition-colors ${
										editingField === "end"
											? "border-blue-500 bg-zinc-900"
											: "border-zinc-700 bg-zinc-900 hover:border-zinc-600"
									}`}
								>
									<div className="min-w-0 flex-1">
										<p className="text-xs text-zinc-400 mb-0.5">End time</p>
										<p className="text-xs text-white">
											{tempEnd ? format(tempEnd, "MMM d, yyyy") : "—"}
										</p>
									</div>
									<Calendar size={13} className="shrink-0 ml-1.5 text-zinc-500" />
								</div>
							</div>

							<button
								type="button"
								onClick={handleApply}
								disabled={!tempStart || !tempEnd}
								className="w-full h-8 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed rounded text-sm font-medium transition-colors text-white cursor-pointer"
							>
								Apply
							</button>
						</div>
					)}
				</div>
			)}

			{/* Floating calendar popup — anchored to whichever field box was clicked */}
			{editingField !== null && calendarPos !== null && (
				<div
					ref={calendarRef}
					style={{
						position: "fixed",
						...(calendarPos.top !== undefined ? { top: calendarPos.top } : {}),
						...(calendarPos.bottom !== undefined ? { bottom: calendarPos.bottom } : {}),
						...(calendarPos.left !== undefined ? { left: calendarPos.left } : {}),
						...(calendarPos.right !== undefined ? { right: calendarPos.right } : {}),
						zIndex: 60,
					}}
					onMouseDown={(e) => e.preventDefault()}
					className="bg-zinc-950 border border-zinc-700 rounded-lg shadow-2xl shadow-black/60 p-3"
				>
					<DayPicker
						mode="single"
						selected={calendarSelected}
						onSelect={handleCalendarSelect}
						className="date-picker-dark"
					/>
				</div>
			)}
		</div>
	);
}

const DAY_PICKER_DARK_CSS = `
.date-picker-dark {
  --rdp-accent-color: #3b82f6;
  --rdp-accent-background-color: #1e40af;
  --rdp-today-color: #3b82f6;
  color: #e4e4e7;
  border-radius: 4px;
  pointer-events: auto !important;
  font-size: 0.75rem;
}
.date-picker-dark .rdp-month_caption {
  color: #e4e4e7;
  font-weight: 600;
  padding: 0 0 0 0.5rem;
  margin-bottom: 0.15rem;
  font-size: 0.8rem;
}
.date-picker-dark .rdp-weekday {
  color: #a1a1aa;
  font-size: 0.65rem;
  padding: 0.05rem 0.1rem;
  width: 1.8rem;
}
.date-picker-dark .rdp-day {
  width: 1.8rem;
  height: 1.8rem;
}
.date-picker-dark .rdp-day_button {
  width: 1.6rem;
  height: 1.6rem;
  padding: 0;
  border-radius: 3px;
  font-size: 0.72rem;
  line-height: 1rem;
}
.date-picker-dark .rdp-day_button:hover:not([disabled]):not(.rdp-selected .rdp-day_button) {
  background-color: #27272a;
}
.date-picker-dark .rdp-selected .rdp-day_button {
  background-color: #3b82f6;
  color: white;
  border-color: #3b82f6;
}
.date-picker-dark .rdp-today:not(.rdp-outside) .rdp-day_button {
  color: #3b82f6;
  font-weight: 600;
}
.date-picker-dark .rdp-day_button:disabled { opacity: 0.25; }
.date-picker-dark .rdp-button_next,
.date-picker-dark .rdp-button_previous {
  padding: 0.15rem;
  border-radius: 4px;
  color: #e4e4e7;
  width: 1.4rem;
  height: 1.4rem;
}
.date-picker-dark .rdp-button_next:hover,
.date-picker-dark .rdp-button_previous:hover { background-color: #27272a; }
.date-picker-dark .rdp-months { padding: 0.25rem; }
.date-picker-dark .rdp-month { width: 100%; }
.date-picker-dark .rdp-caption_label { font-size: 0.8rem; }
`;
