import { useState, useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
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
	const [popupCoords, setPopupCoords] = useState<{
		top: number;
		left: number;
		width: number;
	} | null>(null);

	const date = value ? new Date(value) : new Date();
	const currentH = date.getHours();
	const currentM = date.getMinutes();

	const [hour, setHour] = useState<string>((currentH % 12 || 12).toString().padStart(2, "0"));
	const [minute, setMinute] = useState<string>(currentM.toString().padStart(2, "0"));
	const [period, setPeriod] = useState<string>(currentH >= 12 ? "PM" : "AM");

	const popupRef = useRef<HTMLDivElement>(null);
	const containerRef = useRef<HTMLDivElement>(null);
	const anchorRef = useRef<HTMLDivElement>(null);
	const isUpdatingRef = useRef(false);

	// Sync with value prop
	useEffect(() => {
		if (isUpdatingRef.current) {
			isUpdatingRef.current = false;
			return;
		}
		if (value) {
			const d = new Date(value);
			const hrs = d.getHours();
			setHour((hrs % 12 || 12).toString().padStart(2, "0"));
			setMinute(d.getMinutes().toString().padStart(2, "0"));
			setPeriod(hrs >= 12 ? "PM" : "AM");
		}
	}, [value]);

	// Calculate portal position when opening
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
			width: rect.width,
		});
		setOpen(true);
	}, [dropdownPosition]);

	// Close on outside mousedown
	useEffect(() => {
		if (!open) return;
		const handler = (e: MouseEvent) => {
			const t = e.target as Node;
			if (!popupRef.current?.contains(t) && !containerRef.current?.contains(t))
				setOpen(false);
		};
		document.addEventListener("mousedown", handler, true);
		return () => document.removeEventListener("mousedown", handler, true);
	}, [open]);

	// Close on scroll or resize
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

	const applyTime = useCallback(
		(h: string, m: string, p: string) => {
			if (h === "--" || m === "--" || p === "--") return;
			if (h.includes("_") || m.includes("_")) return;
			const newDate = value ? new Date(value) : new Date();
			let hrs = parseInt(h);
			if (p === "PM" && hrs !== 12) hrs += 12;
			if (p === "AM" && hrs === 12) hrs = 0;
			newDate.setHours(hrs, parseInt(m), 0, 0);
			isUpdatingRef.current = true;
			onChange(newDate);
			setFocusedSection(null);
		},
		[value, onChange]
	);

	// Keyboard input
	useEffect(() => {
		const handleKeyDown = (e: KeyboardEvent) => {
			if (!containerRef.current?.contains(e.target as HTMLElement)) return;
			if (!focusedSection) return;
			const key = e.key;

			if (/^[0-9]$/.test(key)) {
				e.preventDefault();
				if (focusedSection === "hour") {
					if (hour.includes("_")) {
						const full = parseInt(hour[0] + key);
						if (full >= 1 && full <= 12) {
							setHour((hour[0] + key).padStart(2, "0"));
							setFocusedSection("minute");
						}
					} else {
						const num = parseInt(key);
						if (num >= 2 && num <= 9) {
							setHour("0" + key);
							setFocusedSection("minute");
						} else setHour(key + "_");
					}
				} else if (focusedSection === "minute") {
					if (minute.includes("_")) {
						const full = parseInt(minute[0] + key);
						if (full >= 0 && full <= 59) {
							setMinute(
								(minute[0] + key).padStart(2, "0")
							);
							setFocusedSection("period");
						}
					} else {
						setMinute(key + "_");
					}
				}
				return;
			}

			if (focusedSection === "period") {
				if (key === "a" || key === "A") {
					e.preventDefault();
					setPeriod("AM");
					applyTime(hour, minute, "AM");
				}
				if (key === "p" || key === "P") {
					e.preventDefault();
					setPeriod("PM");
					applyTime(hour, minute, "PM");
				}
			}

			if (key === "Backspace") {
				e.preventDefault();
				if (focusedSection === "hour") setHour("--");
				else if (focusedSection === "minute")
					minute === "--"
						? setFocusedSection("hour")
						: setMinute("--");
				else if (focusedSection === "period")
					period === "--"
						? setFocusedSection("minute")
						: setPeriod("--");
			}

			if (key === "ArrowRight" || key === "Tab" || key === " " || key === ":") {
				e.preventDefault();
				const pad = (v: string, set: (s: string) => void) => {
					if (v.includes("_")) set("0" + v[0]);
				};
				if (focusedSection === "hour") {
					pad(hour, setHour);
					setFocusedSection("minute");
				} else if (focusedSection === "minute") {
					pad(minute, setMinute);
					setFocusedSection("period");
				} else if (focusedSection === "period" && key === " ") {
					const fh = hour.includes("_") ? "0" + hour[0] : hour;
					const fm = minute.includes("_") ? "0" + minute[0] : minute;
					const fp = period === "--" ? "AM" : period;
					setHour(fh);
					setMinute(fm);
					setPeriod(fp);
					applyTime(fh, fm, fp);
				}
			}

			if (key === "ArrowLeft") {
				e.preventDefault();
				if (focusedSection === "period") setFocusedSection("minute");
				else if (focusedSection === "minute") setFocusedSection("hour");
			}

			if (key === "Enter") {
				e.preventDefault();
				const fh = hour.includes("_") ? "0" + hour[0] : hour;
				const fm = minute.includes("_") ? "0" + minute[0] : minute;
				const fp = period === "--" ? "AM" : period;
				setHour(fh);
				setMinute(fm);
				setPeriod(fp);
				applyTime(fh, fm, fp);
			}
		};
		document.addEventListener("keydown", handleKeyDown);
		return () => document.removeEventListener("keydown", handleKeyDown);
	}, [focusedSection, hour, minute, period, applyTime]);

	const handlePopupClick = useCallback(
		(h: number, m: number, p: string, close = false) => {
			const hStr = h.toString().padStart(2, "0");
			const mStr = m.toString().padStart(2, "0");
			if (close) setOpen(false);
			setHour(hStr);
			setMinute(mStr);
			setPeriod(p);
			applyTime(hStr, mStr, p);
		},
		[applyTime]
	);

	const hours = Array.from({ length: 12 }, (_, i) => i + 1);
	const minutes = Array.from({ length: 60 }, (_, i) => i);

	const seg = (label: string, sec: "hour" | "minute" | "period") => (
		<span
			onClick={() => setFocusedSection(sec)}
			className={`cursor-pointer px-1 rounded font-mono text-sm select-none ${
				focusedSection === sec ? "bg-blue-600 text-white" : "text-zinc-200"
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
							<div className="flex-1 max-h-[148px] overflow-y-scroll scrollbar-hide">
								{hours.map((h) => (
									<button
										key={h}
										onClick={() =>
											handlePopupClick(
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
										className="w-full px-1.5 py-1 text-xs text-zinc-200 hover:bg-zinc-800 rounded text-center"
									>
										{h
											.toString()
											.padStart(
												2,
												"0"
											)}
									</button>
								))}
							</div>
							<div className="flex-1 max-h-[148px] overflow-y-scroll scrollbar-hide">
								{minutes.map((m) => (
									<button
										key={m}
										onClick={() =>
											handlePopupClick(
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
										className="w-full px-1.5 py-1 text-xs text-zinc-200 hover:bg-zinc-800 rounded text-center"
									>
										{m
											.toString()
											.padStart(
												2,
												"0"
											)}
									</button>
								))}
							</div>
							<div className="flex-1 flex flex-col gap-1">
								{["AM", "PM"].map((p) => (
									<button
										key={p}
										onClick={() =>
											handlePopupClick(
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
										className="w-full px-1.5 py-1 text-xs text-zinc-200 hover:bg-zinc-800 rounded text-center"
									>
										{p}
									</button>
								))}
							</div>
						</div>
					</div>,
					document.body
				)
			: null;

	return (
		<div className="relative w-full" ref={containerRef}>
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
