import { useState, useRef, useEffect, useCallback } from "react";
import { Clock } from "lucide-react";

interface TimePickerProps {
	value: Date | null;
	onChange: (v: Date) => void;
	dropdownPosition?: "above" | "below";
}

export default function TimePicker({
	value,
	onChange,
	dropdownPosition = "below",
}: TimePickerProps) {
	const [open, setOpen] = useState(false);
	const [focusedSection, setFocusedSection] = useState<"hour" | "minute" | "period" | null>(
		null
	);

	const date = value ? new Date(value) : new Date();
	const currentH = date.getHours();
	const currentM = date.getMinutes();

	const display12Hour = currentH % 12 || 12;
	const displayMinute = currentM;
	const displayPeriod = currentH >= 12 ? "PM" : "AM";

	const [hour, setHour] = useState<string>(display12Hour.toString().padStart(2, "0"));
	const [minute, setMinute] = useState<string>(displayMinute.toString().padStart(2, "0"));
	const [period, setPeriod] = useState<string>(displayPeriod);

	const popupRef = useRef<HTMLDivElement>(null);
	const containerRef = useRef<HTMLDivElement>(null);
	const hourRef = useRef<HTMLDivElement>(null);
	const minuteRef = useRef<HTMLDivElement>(null);
	const periodRef = useRef<HTMLDivElement>(null);

	// Track if we're currently updating to prevent sync loops
	const isUpdatingRef = useRef(false);

	// Sync with value prop - but skip if we just updated it ourselves
	useEffect(() => {
		if (isUpdatingRef.current) {
			isUpdatingRef.current = false;
			return;
		}

		if (value) {
			const date = new Date(value);
			const hrs = date.getHours();
			const mins = date.getMinutes();

			setHour((hrs % 12 || 12).toString().padStart(2, "0"));
			setMinute(mins.toString().padStart(2, "0"));
			setPeriod(hrs >= 12 ? "PM" : "AM");
		}
	}, [value]);

	// Close on mousedown outside
	useEffect(() => {
		if (!open) return;

		function handleClickOutside(e: MouseEvent) {
			const target = e.target as Node;

			if (popupRef.current?.contains(target)) {
				return;
			}
			if (containerRef.current?.contains(target)) {
				return;
			}

			setOpen(false);
		}
		document.addEventListener("mousedown", handleClickOutside, true);
		return () => {
			document.removeEventListener("mousedown", handleClickOutside, true);
		};
	}, [open]);

	// Handle keyboard input
	useEffect(() => {
		function handleKeyDown(e: KeyboardEvent) {
			const target = e.target as HTMLElement;

			if (!containerRef.current?.contains(target)) return;

			// Only handle keyboard if a section is focused
			if (!focusedSection) return;

			const key = e.key;

			if (/^[0-9]$/.test(key)) {
				e.preventDefault();

				if (focusedSection === "hour") {
					if (hour === "--") {
						const num = parseInt(key);
						if (num >= 2 && num <= 9) {
							setHour("0" + key);
							setFocusedSection("minute");
						} else if (num === 0) {
							setHour("0" + key);
						} else {
							setHour(key + "_");
						}
					} else if (hour.includes("_")) {
						const firstDigit = hour[0];
						const secondDigit = key;
						const fullHour = parseInt(firstDigit + secondDigit);

						if (fullHour >= 1 && fullHour <= 12) {
							setHour(
								(firstDigit + secondDigit).padStart(
									2,
									"0"
								)
							);
							setFocusedSection("minute");
						}
					} else {
						const num = parseInt(key);
						if (num >= 2 && num <= 9) {
							setHour("0" + key);
							setFocusedSection("minute");
						} else if (num === 0) {
							setHour("0" + key);
						} else {
							setHour(key + "_");
						}
					}
				} else if (focusedSection === "minute") {
					if (minute === "--") {
						setMinute(key + "_");
					} else if (minute.includes("_")) {
						const firstDigit = minute[0];
						const secondDigit = key;
						const fullMinute = parseInt(
							firstDigit + secondDigit
						);

						if (fullMinute >= 0 && fullMinute <= 59) {
							const newMin = (
								firstDigit + secondDigit
							).padStart(2, "0");
							setMinute(newMin);
							setFocusedSection("period");
						}
					} else {
						setMinute(key + "_");
					}
				}
			}

			if ((key === "a" || key === "A") && focusedSection === "period") {
				e.preventDefault();
				setPeriod("AM");
				applyTime(hour, minute, "AM");
			}
			if ((key === "p" || key === "P") && focusedSection === "period") {
				e.preventDefault();
				setPeriod("PM");
				applyTime(hour, minute, "PM");
			}

			if (key === "Backspace") {
				e.preventDefault();
				if (focusedSection === "hour") {
					setHour("--");
				} else if (focusedSection === "minute") {
					if (minute === "--") {
						setFocusedSection("hour");
					} else {
						setMinute("--");
					}
				} else if (focusedSection === "period") {
					if (period === "--") {
						setFocusedSection("minute");
					} else {
						setPeriod("--");
					}
				}
			}

			// Space moves to next section and auto-completes current
			if (key === " ") {
				e.preventDefault();

				if (focusedSection === "hour") {
					if (hour.includes("_")) {
						const paddedHour = "0" + hour[0];
						setHour(paddedHour);
					}
					setFocusedSection("minute");
				} else if (focusedSection === "minute") {
					if (minute.includes("_")) {
						const paddedMinute = "0" + minute[0];
						setMinute(paddedMinute);
					}
					setFocusedSection("period");
				} else if (focusedSection === "period") {
					// Space on period acts as submit
					let finalHour = hour;
					let finalMinute = minute;
					let finalPeriod = period;

					if (hour.includes("_")) {
						finalHour = "0" + hour[0];
						setHour(finalHour);
					}
					if (minute.includes("_")) {
						finalMinute = "0" + minute[0];
						setMinute(finalMinute);
					}
					if (period === "--") {
						finalPeriod = "AM";
						setPeriod(finalPeriod);
					}

					applyTime(finalHour, finalMinute, finalPeriod);
				}
			}

			// Colon also moves to next section and auto-completes
			if (key === ":") {
				e.preventDefault();
				if (focusedSection === "hour") {
					if (hour.includes("_")) {
						const paddedHour = "0" + hour[0];
						setHour(paddedHour);
					}
					setFocusedSection("minute");
				}
			}

			if (key === "ArrowRight" || key === "Tab") {
				e.preventDefault();
				if (focusedSection === "hour") {
					if (hour.includes("_")) {
						const paddedHour = "0" + hour[0];
						setHour(paddedHour);
					}
					setFocusedSection("minute");
				} else if (focusedSection === "minute") {
					if (minute.includes("_")) {
						const paddedMinute = "0" + minute[0];
						setMinute(paddedMinute);
					}
					setFocusedSection("period");
				}
			}
			if (key === "ArrowLeft") {
				e.preventDefault();
				if (focusedSection === "period") setFocusedSection("minute");
				else if (focusedSection === "minute") setFocusedSection("hour");
			}

			if (key === "Enter") {
				e.preventDefault();
				let finalHour = hour;
				let finalMinute = minute;
				let finalPeriod = period;

				if (hour.includes("_")) {
					finalHour = "0" + hour[0];
					setHour(finalHour);
				}
				if (minute.includes("_")) {
					finalMinute = "0" + minute[0];
					setMinute(finalMinute);
				}
				if (period === "--") {
					finalPeriod = "AM";
					setPeriod(finalPeriod);
				}

				applyTime(finalHour, finalMinute, finalPeriod);
			}
		}

		document.addEventListener("keydown", handleKeyDown);
		return () => document.removeEventListener("keydown", handleKeyDown);
	}, [focusedSection, hour, minute, period]);

	const applyTime = useCallback(
		(h: string, m: string, p: string) => {
			if (h === "--" || m === "--" || p === "--") return;
			if (h.includes("_") || m.includes("_")) return;

			const newDate = value ? new Date(value) : new Date();

			let hrs = parseInt(h);
			const mins = parseInt(m);

			// Convert to 24-hour format
			if (p === "PM" && hrs !== 12) hrs += 12;
			if (p === "AM" && hrs === 12) hrs = 0;

			newDate.setHours(hrs);
			newDate.setMinutes(mins);
			newDate.setSeconds(0);
			newDate.setMilliseconds(0);

			isUpdatingRef.current = true;
			onChange(newDate);

			// Clear focus after successful submit
			setFocusedSection(null);
		},
		[value, onChange]
	);

	function handleSectionClick(section: "hour" | "minute" | "period") {
		setFocusedSection(section);
	}

	const handlePopupTimeClick = useCallback(
		(h: number, m: number, p: string, closePopup: boolean = false) => {
			const hStr = h.toString().padStart(2, "0");
			const mStr = m.toString().padStart(2, "0");

			// Close popup immediately BEFORE state updates
			if (closePopup) {
				setOpen(false);
			}

			// Update all state in one batch
			setHour(hStr);
			setMinute(mStr);
			setPeriod(p);

			// Apply the time change
			applyTime(hStr, mStr, p);
		},
		[applyTime]
	);

	const hours = Array.from({ length: 12 }, (_, i) => i + 1);
	const minutes = Array.from({ length: 60 }, (_, i) => i);
	const periods = ["AM", "PM"];

	const isAbove = dropdownPosition === "above";

	return (
		<div className="relative w-full" ref={containerRef}>
			{/* Input display */}
			<div
				className="relative border border-zinc-700 bg-zinc-900 rounded px-3 py-2 flex items-center gap-2"
				tabIndex={0}
			>
				<button
					onClick={() => setOpen(!open)}
					className="text-gray-400 hover:text-gray-200"
				>
					<Clock size={18} />
				</button>
				<div className="flex items-center gap-1 text-base">
					<div
						ref={hourRef}
						onClick={() => handleSectionClick("hour")}
						className={`cursor-pointer px-1 rounded font-mono ${
							focusedSection === "hour"
								? "bg-blue-600 text-white"
								: "text-gray-200"
						}`}
					>
						{hour}
					</div>
					<span className="text-gray-200">:</span>
					<div
						ref={minuteRef}
						onClick={() => handleSectionClick("minute")}
						className={`cursor-pointer px-1 rounded font-mono ${
							focusedSection === "minute"
								? "bg-blue-600 text-white"
								: "text-gray-200"
						}`}
					>
						{minute}
					</div>
					<div
						ref={periodRef}
						onClick={() => handleSectionClick("period")}
						className={`cursor-pointer px-1 rounded font-mono ml-1 ${
							focusedSection === "period"
								? "bg-blue-600 text-white"
								: "text-gray-200"
						}`}
					>
						{period}
					</div>
				</div>
			</div>

			{/* Popup */}
			{open && (
				<div
					ref={popupRef}
					className={`absolute z-[6000] bg-zinc-900 border border-zinc-700 rounded-md shadow-xl p-2 ${
						isAbove ? "mb-1 bottom-full" : "mt-1 top-full"
					}`}
					style={{ width: "160px" }}
				>
					<div className="flex gap-1">
						{/* Hours column */}
						<div className="flex-1 max-h-[156px] overflow-y-scroll scrollbar-hide">
							{hours.map((h) => (
								<button
									key={h}
									onClick={() =>
										handlePopupTimeClick(
											h,
											minute ===
												"--"
												? 0
												: parseInt(
														minute
													),
											period ===
												"--"
												? "AM"
												: period,
											false
										)
									}
									className="w-full px-2 py-1.5 text-sm text-gray-200 hover:bg-zinc-800 rounded text-center"
								>
									{h
										.toString()
										.padStart(2, "0")}
								</button>
							))}
						</div>

						{/* Minutes column */}
						<div className="flex-1 max-h-[156px] overflow-y-scroll scrollbar-hide">
							{minutes.map((m) => (
								<button
									key={m}
									onClick={() =>
										handlePopupTimeClick(
											hour ===
												"--"
												? 12
												: parseInt(
														hour
													),
											m,
											period ===
												"--"
												? "AM"
												: period,
											false
										)
									}
									className="w-full px-2 py-1.5 text-sm text-gray-200 hover:bg-zinc-800 rounded text-center"
								>
									{m
										.toString()
										.padStart(2, "0")}
								</button>
							))}
						</div>

						{/* AM/PM column */}
						<div className="flex-1 max-h-[156px] flex flex-col gap-1">
							{periods.map((p) => (
								<button
									key={p}
									onClick={() =>
										handlePopupTimeClick(
											hour ===
												"--"
												? 12
												: parseInt(
														hour
													),
											minute ===
												"--"
												? 0
												: parseInt(
														minute
													),
											p,
											true
										)
									}
									className="w-full px-2 py-1.5 text-sm text-gray-200 hover:bg-zinc-800 rounded text-center"
								>
									{p}
								</button>
							))}
						</div>
					</div>
				</div>
			)}

			<style>{`
        .scrollbar-hide::-webkit-scrollbar {
          display: none;
        }
        .scrollbar-hide {
          -ms-overflow-style: none;
          scrollbar-width: none;
        }
      `}</style>
		</div>
	);
}
