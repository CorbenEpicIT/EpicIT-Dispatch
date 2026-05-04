import { useState, useRef, useEffect } from "react";
import { ChevronDown, Check, X } from "lucide-react";
import { useSearchParams } from "react-router-dom";

export interface StatusOption {
	value: string;
	label: string;
}

interface BaseProps {
	options: StatusOption[];
	allLabel?: string;
	placeholder?: string;
	hideAll?: boolean;
}

interface StatusFilterUrlProps extends BaseProps {
	paramKey: string;
}

interface StatusFilterControlledProps extends BaseProps {
	value: string | null;
	onChange: (value: string | null) => void;
}

type StatusFilterProps = StatusFilterUrlProps | StatusFilterControlledProps;

export default function StatusFilter(props: StatusFilterProps) {
	if ("paramKey" in props) {
		return <UrlStatusFilter {...props} />;
	}
	return <DropdownFilter {...props} />;
}

function UrlStatusFilter({ paramKey, ...rest }: StatusFilterUrlProps) {
	const [searchParams, setSearchParams] = useSearchParams();
	const value = searchParams.get(paramKey);

	const handleChange = (newValue: string | null) => {
		setSearchParams((prev) => {
			const next = new URLSearchParams(prev);
			if (newValue) {
				next.set(paramKey, newValue);
			} else {
				next.delete(paramKey);
			}
			return next;
		});
	};

	return <DropdownFilter value={value} onChange={handleChange} {...rest} />;
}

function DropdownFilter({
	value,
	onChange,
	options,
	allLabel = "All",
	placeholder = "Status",
	hideAll = false,
}: StatusFilterControlledProps) {
	const [open, setOpen] = useState(false);
	const containerRef = useRef<HTMLDivElement>(null);
	const selectedOption = options.find((o) => o.value === value) ?? null;
	const isActive = value !== null;

	useEffect(() => {
		if (!open) return;
		const onDown = (e: MouseEvent) => {
			if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
				setOpen(false);
			}
		};
		const onKey = (e: KeyboardEvent) => {
			if (e.key === "Escape") setOpen(false);
		};
		document.addEventListener("mousedown", onDown);
		document.addEventListener("keydown", onKey);
		return () => {
			document.removeEventListener("mousedown", onDown);
			document.removeEventListener("keydown", onKey);
		};
	}, [open]);

	const handleSelect = (optionValue: string | null) => {
		onChange(optionValue === value ? null : optionValue);
		setOpen(false);
	};

	return (
		<div className="relative" ref={containerRef}>
			<button
				type="button"
				onClick={() => setOpen((o) => !o)}
				aria-expanded={open}
				aria-haspopup="listbox"
				className={`flex items-center gap-1.5 h-9 px-3 rounded-md border text-sm transition-colors cursor-pointer whitespace-nowrap ${
					isActive && !hideAll
						? "bg-blue-950 border-blue-500 text-blue-300"
						: "bg-zinc-800 border-zinc-700 text-zinc-400 hover:text-white"
				}`}
			>
				<span>
					{isActive && selectedOption
						? `${placeholder}: ${selectedOption.label}`
						: placeholder}
				</span>
				{isActive && !hideAll ? (
					<X
						size={14}
						className="shrink-0"
						onClick={(e) => {
							e.stopPropagation();
							onChange(null);
						}}
					/>
				) : (
					<ChevronDown size={14} className="shrink-0" />
				)}
			</button>

			{open && (
				<div
					role="listbox"
					aria-label={placeholder}
					className="absolute left-0 mt-1.5 min-w-44 bg-zinc-950 border border-zinc-600 rounded-lg shadow-2xl shadow-black/50 z-50 overflow-hidden"
				>
					<div className="py-1 px-1">
						{!hideAll && (
							<>
								<button
									role="option"
									aria-selected={!isActive}
									onClick={() => handleSelect(null)}
									className={`w-full flex items-center justify-between px-3 py-1.5 text-sm cursor-pointer rounded text-left ${
										!isActive
											? "bg-blue-950/60 text-blue-300"
											: "text-zinc-300 hover:bg-zinc-800/70"
									}`}
								>
									<span>{allLabel}</span>
									{!isActive && <Check size={14} />}
								</button>
								<div className="border-t border-zinc-700 my-1 -mx-1" />
							</>
						)}
						{options.map((option) => (
							<button
								key={option.value}
								role="option"
								aria-selected={value === option.value}
								onClick={() => handleSelect(option.value)}
								className={`w-full flex items-center justify-between px-3 py-1.5 text-sm cursor-pointer rounded text-left ${
									value === option.value
										? "bg-blue-950/60 text-blue-300"
										: "text-zinc-300 hover:bg-zinc-800/70"
								}`}
							>
								<span>{option.label}</span>
								{value === option.value && <Check size={14} />}
							</button>
						))}
					</div>
				</div>
			)}
		</div>
	);
}
