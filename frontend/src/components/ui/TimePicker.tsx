import { useState, useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { Clock } from "lucide-react";

interface TimePickerProps {
	value: Date | null;
	onChange: (v: Date) => void;
	dropdownPosition?: "above" | "below";
}

type Section = "hour" | "minute" | "period";

// Resolve a partial/incomplete display string to a valid integer, clamped to range.
// "_" suffix means the user typed one digit — treat the digit as the full value.
const resolveHour = (h: string): number => {
	if (h === "--") return 12;
	const n = parseInt(h.replace("_", ""));
	if (isNaN(n)) return 12;
	return Math.min(Math.max(n, 1), 12);
};

const resolveMinute = (m: string): number => {
	if (m === "--") return 0;
	const n = parseInt(m.replace("_", ""));
	if (isNaN(n)) return 0;
	return Math.min(Math.max(n, 0), 59);
};

const resolvePeriod = (p: string): "AM" | "PM" => (p === "PM" ? "PM" : "AM");

const toDisplay = (v: Date | null) => {
	const d = v ?? new Date();
	const h = d.getHours();
	return {
		hour: (h % 12 || 12).toString().padStart(2, "0"),
		minute: d.getMinutes().toString().padStart(2, "0"),
		period: (h >= 12 ? "PM" : "AM") as "AM" | "PM",
	};
};

export default function TimePicker({
	value,
	onChange,
	dropdownPosition = "below",
}: TimePickerProps) {
	const [open, setOpen] = useState(false);
	const [focusedSection, setFocusedSection] = useState<Section | null>(null);
	const [popupCoords, setPopupCoords] = useState<{
		top: number;
		left: number;
	} | null>(null);

	const init = toDisplay(value);
	const [hour, setHour] = useState<string>(init.hour);
	const [minute, setMinute] = useState<string>(init.minute);
	const [period, setPeriod] = useState<"AM" | "PM" | "--">(init.period);

	const popupRef = useRef<HTMLDivElement>(null);
	const containerRef = useRef<HTMLDivElement>(null);
	const anchorRef = useRef<HTMLDivElement>(null);
	const lastAppliedRef = useRef<number | null>(value?.getTime() ?? null);

	// ── Sync from external value changes (draft restore, undo) ────────────
	useEffect(() => {
		const incoming = value?.getTime() ?? null;
		if (incoming === lastAppliedRef.current) return;
		lastAppliedRef.current = incoming;
		if (value) {
			const { hour: h, minute: m, period: p } = toDisplay(value);
			setHour(h);
			setMinute(m);
			setPeriod(p);
		}
	}, [value]);

	// ── Commit: build a Date from current display state and fire onChange ──
	// Tolerates incomplete entries — resolves them to nearest valid value.
	// Always fires so blur/navigation never silently drops a partial edit.
	const commit = useCallback(
		(h: string, m: string, p: "AM" | "PM" | "--") => {
			const resolvedH = resolveHour(h);
			const resolvedM = resolveMinute(m);
			const resolvedP = resolvePeriod(p);

			// Normalise display to resolved values
			const normH = resolvedH.toString().padStart(2, "0");
			const normM = resolvedM.toString().padStart(2, "0");
			setHour(normH);
			setMinute(normM);
			setPeriod(resolvedP);

			const newDate = value ? new Date(value) : new Date();
			let hrs = resolvedH;
			if (resolvedP === "PM" && hrs !== 12) hrs += 12;
			if (resolvedP === "AM" && hrs === 12) hrs = 0;
			newDate.setHours(hrs, resolvedM, 0, 0);

			const ts = newDate.getTime();
			if (ts === lastAppliedRef.current) return; // no actual change
			lastAppliedRef.current = ts;
			onChange(newDate);
		},
		[value, onChange]
	);

	// ── Blur: commit when focus leaves the entire component ───────────────
	const handleBlur = useCallback(
		(e: React.FocusEvent) => {
			const related = e.relatedTarget as Node | null;
			// Ignore if focus moved to another element inside the container or the portal popup
			if (containerRef.current?.contains(related)) return;
			if (popupRef.current?.contains(related)) return;
			if (focusedSection !== null) {
				commit(hour, minute, period);
				setFocusedSection(null);
			}
		},
		[focusedSection, hour, minute, period, commit]
	);

	// ── Portal positioning ─────────────────────────────────────────────────
	const openPopup = useCallback(() => {
		if (!anchorRef.current) return;
		const rect = anchorRef.current.getBoundingClientRect();
		const POPUP_H = 180;
		const above =
			dropdownPosition === "above" ||
			(dropdownPosition === "below" &&
				window.innerHeight - rect.bottom < POPUP_H);
		setPopupCoords({
			top: above
				? rect.top + window.scrollY - POPUP_H - 4
				: rect.bottom + window.scrollY + 4,
			left: rect.left + window.scrollX,
		});
		setOpen(true);
	}, [dropdownPosition]);

	useEffect(() => {
		if (!open) return;
		const handler = (e: MouseEvent) => {
			const t = e.target as Node;
			if (!popupRef.current?.contains(t) && !containerRef.current?.contains(t)) {
				setOpen(false);
			}
		};
		document.addEventListener("mousedown", handler, true);
		return () => document.removeEventListener("mousedown", handler, true);
	}, [open]);

	useEffect(() => {
		if (!open) return;
		const handler = () => setOpen(false);
		window.addEventListener("scroll", handler, true);
		window.addEventListener("resize", handler);
		return () => {
			window.removeEventListener("scroll", handler, true);
			window.removeEventListener("resize", handler);
		};
	}, [open]);

	// ── Keyboard handler ──────────────────────────────────────────────────
	useEffect(() => {
		const handleKeyDown = (e: KeyboardEvent) => {
			if (!containerRef.current?.contains(e.target as HTMLElement)) return;
			if (!focusedSection) return;
			const key = e.key;

			// ── Digits ────────────────────────────────────────────────────
			if (/^[0-9]$/.test(key)) {
				e.preventDefault();
				const n = parseInt(key);

				if (focusedSection === "hour") {
					if (hour.includes("_")) {
						const full = parseInt(hour[0] + key);
						if (full >= 1 && full <= 12) {
							const h = full.toString().padStart(2, "0");
							setHour(h);
							commit(h, minute, period);
							setFocusedSection("minute");
						} else if (full === 0) {
							setHour("12");
							commit("12", minute, period);
							setFocusedSection("minute");
						}
					} else {
						if (n === 0) {
							setHour("0_");
						} else if (n >= 2 && n <= 9) {
							const h = "0" + key;
							setHour(h);
							commit(h, minute, period);
							setFocusedSection("minute");
						} else {
							setHour(key + "_");
						}
					}
				} else if (focusedSection === "minute") {
					if (minute.includes("_")) {
						const full = parseInt(minute[0] + key);
						if (full >= 0 && full <= 59) {
							const m = full.toString().padStart(2, "0");
							setMinute(m);
							commit(hour, m, period);
							setFocusedSection("period");
						}
					} else {
						if (n <= 5) {
							setMinute(key + "_");
						} else {
							const m = "0" + key;
							setMinute(m);
							commit(hour, m, period);
							setFocusedSection("period");
						}
					}
				}
				return;
			}

			// ── Period keys ────────────────────────────────────────────────
			if (focusedSection === "period") {
				if (key === "a" || key === "A") {
					e.preventDefault();
					setPeriod("AM");
					commit(hour, minute, "AM");
				}
				if (key === "p" || key === "P") {
					e.preventDefault();
					setPeriod("PM");
					commit(hour, minute, "PM");
				}
			}

			// ── Arrow Up/Down: increment/decrement value ───────────────────
			if (key === "ArrowUp" || key === "ArrowDown") {
				e.preventDefault();
				const delta = key === "ArrowUp" ? 1 : -1;
				if (focusedSection === "hour") {
					const cur = resolveHour(hour);
					const next = ((cur - 1 + delta + 12) % 12) + 1;
					const h = next.toString().padStart(2, "0");
					setHour(h);
					commit(h, minute, period);
				} else if (focusedSection === "minute") {
					const cur = resolveMinute(minute);
					const next = (cur + delta + 60) % 60;
					const m = next.toString().padStart(2, "0");
					setMinute(m);
					commit(hour, m, period);
				} else if (focusedSection === "period") {
					const next = period === "AM" ? "PM" : "AM";
					setPeriod(next);
					commit(hour, minute, next);
				}
			}

			// ── Navigation ─────────────────────────────────────────────────
			if (key === "ArrowRight" || key === "Tab" || key === ":" || key === " ") {
				e.preventDefault();
				if (focusedSection === "hour") {
					// Commit partial hour before moving
					const h = resolveHour(hour).toString().padStart(2, "0");
					setHour(h);
					commit(h, minute, period);
					setFocusedSection("minute");
				} else if (focusedSection === "minute") {
					const m = resolveMinute(minute).toString().padStart(2, "0");
					setMinute(m);
					commit(hour, m, period);
					setFocusedSection("period");
				} else if (focusedSection === "period") {
					// Tab out — commit and release focus
					commit(hour, minute, period);
					setFocusedSection(null);
				}
			}

			if (key === "ArrowLeft") {
				e.preventDefault();
				if (focusedSection === "period") {
					commit(hour, minute, period);
					setFocusedSection("minute");
				} else if (focusedSection === "minute") {
					commit(hour, minute, period);
					setFocusedSection("hour");
				}
			}

			// ── Backspace: clear section and step back ─────────────────────
			if (key === "Backspace") {
				e.preventDefault();
				if (focusedSection === "hour") {
					setHour("--");
				} else if (focusedSection === "minute") {
					if (minute === "--") setFocusedSection("hour");
					else setMinute("--");
				} else if (focusedSection === "period") {
					if (period === "--") setFocusedSection("minute");
					else setPeriod("--");
				}
			}

			// ── Enter: commit and release focus ───────────────────────────
			if (key === "Enter" || key === "Escape") {
				e.preventDefault();
				commit(hour, minute, period);
				setFocusedSection(null);
				setOpen(false);
			}
		};

		document.addEventListener("keydown", handleKeyDown);
		return () => document.removeEventListener("keydown", handleKeyDown);
	}, [focusedSection, hour, minute, period, commit]);

	const handlePopupClick = useCallback(
		(h: number, m: number, p: "AM" | "PM", closeAfter: boolean) => {
			const hStr = h.toString().padStart(2, "0");
			const mStr = m.toString().padStart(2, "0");
			setHour(hStr);
			setMinute(mStr);
			setPeriod(p);
			commit(hStr, mStr, p);
			if (closeAfter) setOpen(false);
		},
		[commit]
	);

	const hours = Array.from({ length: 12 }, (_, i) => i + 1);
	const minutes = Array.from({ length: 60 }, (_, i) => i);

	// Whether the current display state is a complete, valid time
	const isIncomplete =
		hour === "--" ||
		minute === "--" ||
		period === "--" ||
		hour.includes("_") ||
		minute.includes("_");

	// Switching sections via click must commit any partial state in the current
	// section first — otherwise "1_" in hour is silently lost.
	const switchSection = useCallback(
		(next: Section) => {
			if (focusedSection !== null && focusedSection !== next) {
				// Resolve and normalise the section being left
				if (
					focusedSection === "hour" &&
					(hour.includes("_") || hour === "--")
				) {
					const h = resolveHour(hour).toString().padStart(2, "0");
					setHour(h);
					commit(h, minute, period);
				} else if (
					focusedSection === "minute" &&
					(minute.includes("_") || minute === "--")
				) {
					const m = resolveMinute(minute).toString().padStart(2, "0");
					setMinute(m);
					commit(hour, m, period);
				}
			}
			setFocusedSection(next);
		},
		[focusedSection, hour, minute, period, commit]
	);

	const seg = (label: string, sec: Section) => (
		<span
			onClick={() => switchSection(sec)}
			className={`cursor-pointer px-1 rounded font-mono text-sm select-none transition-colors ${
				focusedSection === sec
					? "bg-blue-600 text-white"
					: isIncomplete && (label === "--" || label.includes("_"))
						? "text-zinc-500"
						: "text-zinc-200"
			}`}
		>
			{label}
		</span>
	);

	const popup =
		open && popupCoords
			? createPortal(
					<div
						ref={popupRef}
						style={{
							position: "absolute",
							top: popupCoords.top,
							left: popupCoords.left,
							width: "152px",
							zIndex: 9999,
						}}
						className="bg-zinc-900 border border-zinc-700 rounded shadow-xl p-1.5"
					>
						<div className="flex gap-1">
							{/* Hours */}
							<div className="flex-1 max-h-[148px] overflow-y-scroll scrollbar-hide">
								{hours.map((h) => {
									const active =
										!hour.includes(
											"_"
										) &&
										hour !== "--" &&
										resolveHour(
											hour
										) === h;
									return (
										<button
											key={h}
											onClick={() =>
												handlePopupClick(
													h,
													resolveMinute(
														minute
													),
													resolvePeriod(
														period
													),
													false
												)
											}
											className={`w-full px-1.5 py-1 text-xs rounded text-center transition-colors ${
												active
													? "bg-blue-600 text-white"
													: "text-zinc-200 hover:bg-zinc-800"
											}`}
										>
											{h
												.toString()
												.padStart(
													2,
													"0"
												)}
										</button>
									);
								})}
							</div>
							{/* Minutes */}
							<div className="flex-1 max-h-[148px] overflow-y-scroll scrollbar-hide">
								{minutes.map((m) => {
									const active =
										!minute.includes(
											"_"
										) &&
										minute !== "--" &&
										resolveMinute(
											minute
										) === m;
									return (
										<button
											key={m}
											onClick={() =>
												handlePopupClick(
													resolveHour(
														hour
													),
													m,
													resolvePeriod(
														period
													),
													false
												)
											}
											className={`w-full px-1.5 py-1 text-xs rounded text-center transition-colors ${
												active
													? "bg-blue-600 text-white"
													: "text-zinc-200 hover:bg-zinc-800"
											}`}
										>
											{m
												.toString()
												.padStart(
													2,
													"0"
												)}
										</button>
									);
								})}
							</div>
							{/* AM/PM — clicking period closes the popup */}
							<div className="flex-1 flex flex-col gap-1">
								{(["AM", "PM"] as const).map(
									(p) => (
										<button
											key={p}
											onClick={() =>
												handlePopupClick(
													resolveHour(
														hour
													),
													resolveMinute(
														minute
													),
													p,
													true
												)
											}
											className={`w-full px-1.5 py-1 text-xs rounded text-center transition-colors ${
												period ===
												p
													? "bg-blue-600 text-white"
													: "text-zinc-200 hover:bg-zinc-800"
											}`}
										>
											{p}
										</button>
									)
								)}
							</div>
						</div>
					</div>,
					document.body
				)
			: null;

	return (
		<div className="relative w-full" ref={containerRef} onBlur={handleBlur}>
			<div
				ref={anchorRef}
				className="border border-zinc-700 bg-zinc-900 rounded h-[34px] px-2.5 flex items-center gap-1.5 hover:border-zinc-600 focus-within:border-blue-500 transition-colors cursor-default"
				tabIndex={0}
			>
				<Clock
					size={14}
					className="text-zinc-400 flex-shrink-0 cursor-pointer hover:text-zinc-200 transition-colors"
					onClick={() => (open ? setOpen(false) : openPopup())}
				/>
				<div className="flex items-center gap-0.5">
					{seg(hour, "hour")}
					<span className="text-zinc-400 text-sm select-none">:</span>
					{seg(minute, "minute")}
					<span className="text-zinc-400 text-sm select-none mx-0.5">
						{" "}
					</span>
					{seg(period, "period")}
				</div>
			</div>

			{popup}

			<style>{`
				.scrollbar-hide::-webkit-scrollbar { display: none; }
				.scrollbar-hide { -ms-overflow-style: none; scrollbar-width: none; }
			`}</style>
		</div>
	);
}
