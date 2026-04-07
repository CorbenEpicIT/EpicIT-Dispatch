import { useState, useRef, useEffect } from "react";
import { ChevronDown, Check, Users } from "lucide-react";
import type { Technician } from "../../../types/technicians";

interface TechFilterProps {
	technicians: Technician[];
	selected: Set<string>;          // empty = All
	onChange: (next: Set<string>) => void;
	techColorMap: Map<string, string>;
}

export default function TechFilter({ technicians, selected, onChange, techColorMap }: TechFilterProps) {
	const [dropdownOpen, setDropdownOpen] = useState(false);
	const [mode, setMode] = useState<"pills" | "dropdown">("pills");

	const wrapRef     = useRef<HTMLDivElement>(null);
	const probeRef    = useRef<HTMLDivElement>(null);
	const dropdownRef = useRef<HTMLDivElement>(null);

	// Auto-detect: measure whether pills fit in available container width
	useEffect(() => {
		const wrap  = wrapRef.current;
		const probe = probeRef.current;
		if (!wrap || !probe) return;
		const check = () => {
			setMode(probe.scrollWidth > wrap.clientWidth ? "dropdown" : "pills");
		};
		const ro = new ResizeObserver(check);
		ro.observe(wrap);
		check();
		return () => ro.disconnect();
	}, [technicians]);

	// Close dropdown on outside click
	useEffect(() => {
		if (!dropdownOpen) return;
		function handleClick(e: MouseEvent) {
			if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
				setDropdownOpen(false);
			}
		}
		document.addEventListener("mousedown", handleClick);
		return () => document.removeEventListener("mousedown", handleClick);
	}, [dropdownOpen]);

	function toggleTech(id: string) {
		const next = new Set(selected);
		if (next.has(id)) {
			next.delete(id);
		} else {
			next.add(id);
			if (next.size === technicians.length) {
				onChange(new Set());
				return;
			}
		}
		onChange(next);
	}

	function selectAll() {
		onChange(new Set());
		setDropdownOpen(false);
	}

	const isFiltered  = selected.size > 0;
	const selectedArr = technicians.filter((t) => selected.has(t.id));

	// ── Pill styles ───────────────────────────────────────────────────────────

	function renderPills() {
		return (
			<div className="flex items-center gap-1.5">
				<button
					onClick={selectAll}
					className={`h-7 px-2.5 rounded text-[11px] font-medium border transition-colors shrink-0 ${
						selected.size === 0
							? "bg-blue-500/10 border-blue-500/25 text-blue-300"
							: "border-transparent text-zinc-500 hover:text-zinc-300"
					}`}
				>
					All
				</button>
				{technicians.map((tech) => {
					const color     = techColorMap.get(tech.id) ?? "#6b7280";
					const isSel     = selected.has(tech.id);
					return (
						<button
							key={tech.id}
							onClick={() => toggleTech(tech.id)}
							className="h-7 px-2.5 rounded text-[11px] font-medium border transition-colors shrink-0 flex items-center gap-1.5"
							style={
								isSel
									? { backgroundColor: color + "22", borderColor: color + "55", color }
									: { borderColor: "transparent", color: "#71717a" }
							}
						>
							<span
								className="w-1.5 h-1.5 rounded-full flex-shrink-0"
								style={{ backgroundColor: color }}
							/>
							{tech.name}
						</button>
					);
				})}
			</div>
		);
	}

	// ── Dropdown mode ─────────────────────────────────────────────────────────

	function renderDropdown() {
		return (
			<div className="relative" ref={dropdownRef}>
				<button
					onClick={() => setDropdownOpen((v) => !v)}
					className={`flex items-center gap-1.5 h-7 px-2.5 rounded text-[11px] font-medium border transition-colors shrink-0 ${
						isFiltered
							? "bg-blue-500/10 border-blue-500/25 text-blue-300"
							: "border-zinc-700 text-zinc-400 hover:border-zinc-600 hover:text-zinc-300"
					}`}
				>
					<Users size={11} className="shrink-0" />

					{/* Color dots for selected techs */}
					{isFiltered && (
						<span className="flex items-center gap-0.5">
							{selectedArr.slice(0, 4).map((t) => (
								<span
									key={t.id}
									className="w-1.5 h-1.5 rounded-full flex-shrink-0"
									style={{ backgroundColor: techColorMap.get(t.id) ?? "#6b7280" }}
								/>
							))}
						</span>
					)}

					<span>
						{isFiltered ? `${selected.size} of ${technicians.length}` : "Technicians"}
					</span>

					<ChevronDown
						size={10}
						className="shrink-0 text-zinc-500"
						style={{ transform: dropdownOpen ? "rotate(180deg)" : "none", transition: "transform 0.15s" }}
					/>
				</button>

				{dropdownOpen && (
					<div className="absolute left-0 top-full mt-1 z-50 w-52 bg-zinc-900 border border-zinc-800 rounded-lg shadow-2xl overflow-hidden">
						{/* All technicians */}
						<div className="p-1">
							<button
								onClick={selectAll}
								className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded text-[11px] text-left transition-colors hover:bg-zinc-800"
							>
								<span
									className={`w-3.5 h-3.5 rounded border flex items-center justify-center flex-shrink-0 transition-colors ${
										selected.size === 0
											? "bg-blue-500 border-blue-500"
											: "border-zinc-600"
									}`}
								>
									{selected.size === 0 && <Check size={9} strokeWidth={3} className="text-white" />}
								</span>
								<span className={selected.size === 0 ? "text-blue-300 font-medium" : "text-zinc-300"}>
									All technicians
								</span>
							</button>
						</div>

						<div className="h-px bg-zinc-800" />

						{/* Scrollable tech list */}
						<div className="p-1 overflow-y-auto" style={{ maxHeight: 272 }}>
							{technicians.map((tech) => {
								const color = techColorMap.get(tech.id) ?? "#6b7280";
								const isSel = selected.has(tech.id);
								return (
									<button
										key={tech.id}
										onClick={() => toggleTech(tech.id)}
										className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded text-[11px] text-left transition-colors hover:bg-zinc-800 text-zinc-300"
									>
										<span
											className="w-3.5 h-3.5 rounded border flex items-center justify-center flex-shrink-0 transition-colors"
											style={
												isSel
													? { backgroundColor: color, borderColor: color }
													: { borderColor: "#52525b" }
											}
										>
											{isSel && <Check size={9} strokeWidth={3} className="text-white" />}
										</span>
										<span
											className="w-2 h-2 rounded-full flex-shrink-0"
											style={{ backgroundColor: color }}
										/>
										<span className="truncate">{tech.name}</span>
									</button>
								);
							})}
						</div>

						{/* Footer: clear selection */}
						{isFiltered && (
							<>
								<div className="h-px bg-zinc-800" />
								<div className="p-1">
									<button
										onClick={selectAll}
										className="w-full px-2.5 py-1.5 rounded text-[10px] text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 text-left transition-colors"
									>
										Clear selection
									</button>
								</div>
							</>
						)}
					</div>
				)}
			</div>
		);
	}

	return (
		<div ref={wrapRef} className={`relative flex items-center min-w-0 ${mode === "pills" ? "overflow-hidden" : ""}`}>
			{/* Invisible probe: measures how wide pills would actually be */}
			<div
				ref={probeRef}
				className="absolute top-0 left-0 flex items-center gap-1.5 pointer-events-none"
				style={{ visibility: "hidden", whiteSpace: "nowrap" }}
				aria-hidden="true"
			>
				<span className="h-7 px-2.5 text-[11px]">All</span>
				{technicians.map((tech) => (
					<span key={tech.id} className="h-7 px-2.5 text-[11px] flex items-center gap-1.5">
						<span className="w-1.5 h-1.5 rounded-full" />
						{tech.name}
					</span>
				))}
			</div>

			{mode === "pills" ? renderPills() : renderDropdown()}
		</div>
	);
}
