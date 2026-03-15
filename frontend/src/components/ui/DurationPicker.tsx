import { useState, useRef, useEffect } from "react";
import { Clock } from "lucide-react";

interface DurationPickerProps {
	value: number; // total minutes
	onChange: (mins: number) => void;
}

export default function DurationPicker({ value, onChange }: DurationPickerProps) {
	const [open, setOpen] = useState(false);
	const [focusedSection, setFocusedSection] = useState<"hour" | "minute" | null>(null);

	// Initialize with value to prevent flash
	const initialHours = Math.floor(value / 60)
		.toString()
		.padStart(2, "0");
	const initialMinutes = (value % 60).toString().padStart(2, "0");
	const [hour, setHour] = useState<string>(initialHours);
	const [minute, setMinute] = useState<string>(initialMinutes);

	const popupRef = useRef<HTMLDivElement>(null);
	const containerRef = useRef<HTMLDivElement>(null);
	const hourRef = useRef<HTMLDivElement>(null);
	const minuteRef = useRef<HTMLDivElement>(null);

	// Convert total minutes to display format
	useEffect(() => {
		if (value >= 0) {
			const hrs = Math.floor(value / 60);
			const mins = value % 60;

			setHour(hrs.toString().padStart(2, "0"));
			setMinute(mins.toString().padStart(2, "0"));
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
						setHour(key + "_");
					} else if (hour.includes("_")) {
						const firstDigit = hour[0];
						const secondDigit = key;
						const newHour = firstDigit + secondDigit;
						setHour(newHour);
						setFocusedSection("minute");
					} else {
						setHour(key + "_");
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

						if (fullMinute >= 0 && fullMinute <= 99) {
							const newMin = (
								firstDigit + secondDigit
							).padStart(2, "0");
							setMinute(newMin);
							applyTime(hour, newMin);
						}
					} else {
						setMinute(key + "_");
					}
				}
			}

			// Space moves to next section and auto-completes current
			if (key === " ") {
				e.preventDefault();

				if (focusedSection === "hour") {
					// Pad incomplete hour before moving to minute
					if (hour.includes("_")) {
						const paddedHour = "0" + hour[0];
						setHour(paddedHour);
					}
					setFocusedSection("minute");
				} else if (focusedSection === "minute") {
					// Space on minute acts as submit
					let finalHour = hour;
					let finalMinute = minute;

					if (hour.includes("_")) {
						finalHour = "0" + hour[0];
						setHour(finalHour);
					}
					if (minute.includes("_")) {
						finalMinute = "0" + minute[0];
						setMinute(finalMinute);
					}

					applyTime(finalHour, finalMinute);
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
				}
			}

			if (key === "ArrowRight" || key === "Tab") {
				e.preventDefault();
				if (focusedSection === "hour") {
					// Auto-pad before moving
					if (hour.includes("_")) {
						const paddedHour = "0" + hour[0];
						setHour(paddedHour);
					}
					setFocusedSection("minute");
				}
			}

			if (key === "ArrowLeft") {
				e.preventDefault();
				if (focusedSection === "minute") setFocusedSection("hour");
			}

			if (key === "Enter") {
				e.preventDefault();
				let finalHour = hour;
				let finalMinute = minute;

				if (hour.includes("_")) {
					finalHour = "0" + hour[0];
					setHour(finalHour);
				}
				if (minute.includes("_")) {
					finalMinute = "0" + minute[0];
					setMinute(finalMinute);
				}

				applyTime(finalHour, finalMinute);
			}
		}

		document.addEventListener("keydown", handleKeyDown);
		return () => document.removeEventListener("keydown", handleKeyDown);
	}, [focusedSection, hour, minute]);

	function applyTime(h: string, m: string) {
		if (h === "--" || m === "--") return;
		if (h.includes("_") || m.includes("_")) return;

		const hrs = parseInt(h);
		const mins = parseInt(m);

		const totalMinutes = hrs * 60 + mins;
		onChange(totalMinutes);
		setFocusedSection(null);
	}

	function handleSectionClick(section: "hour" | "minute") {
		setFocusedSection(section);
	}

	function handlePopupTimeClick(h: number, m: number, isMinute: boolean = false) {
		setHour(h.toString().padStart(2, "0"));
		setMinute(m.toString().padStart(2, "0"));
		applyTime(h.toString().padStart(2, "0"), m.toString().padStart(2, "0"));

		if (isMinute) {
			setOpen(false);
		}
	}

	const hours = Array.from({ length: 24 }, (_, i) => i);
	const minutes = Array.from({ length: 60 }, (_, i) => i);

	return (
		<div className="relative w-full" ref={containerRef}>
			{/* Input display */}
			<div
				className="relative border border-zinc-700 bg-zinc-900 rounded px-2.5 py-1.5 flex items-center justify-between hover:border-zinc-600 focus-within:border-blue-500 transition-colors"
				tabIndex={0}
			>
				<div className="flex items-center gap-2 text-sm">
					<div
						ref={hourRef}
						onClick={() => handleSectionClick("hour")}
						className={`cursor-pointer px-1 rounded font-mono ${
							focusedSection === "hour"
								? "bg-blue-600 text-white"
								: "text-zinc-200"
						}`}
					>
						{hour}
					</div>
					<span className="text-zinc-400 text-xs">hr</span>
					<div
						ref={minuteRef}
						onClick={() => handleSectionClick("minute")}
						className={`cursor-pointer px-1 rounded font-mono ${
							focusedSection === "minute"
								? "bg-blue-600 text-white"
								: "text-zinc-200"
						}`}
					>
						{minute}
					</div>
					<span className="text-zinc-400 text-xs">min</span>
				</div>
				<button
					onClick={() => setOpen(!open)}
					className="text-zinc-400 hover:text-zinc-200 flex-shrink-0"
				>
					<Clock size={16} />
				</button>
			</div>

			{/* Popup */}
			{open && (
				<div
					ref={popupRef}
					className="absolute z-[6000] bg-zinc-900 border border-zinc-700 rounded-md shadow-xl mt-1 p-2"
					style={{ width: "120px", right: 0 }}
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
												? 0
												: parseInt(
														hour
													),
											m,
											true
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
