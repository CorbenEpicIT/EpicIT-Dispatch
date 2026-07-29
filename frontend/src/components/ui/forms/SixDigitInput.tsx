import { useRef } from "react";

interface Props {
	value: string[];
	onChange: (next: string[]) => void;
	onComplete?: (code: string) => void;
	disabled?: boolean;
	autoFocus?: boolean;
}

export function SixDigitInput({ value, onChange, onComplete, disabled, autoFocus }: Props) {
	const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

	const emit = (next: string[]) => {
		onChange(next);
		if (next.every((d) => d !== "")) onComplete?.(next.join(""));
	};

	const handleChange = (index: number, raw: string) => {
		if (!/^\d*$/.test(raw)) return;
		const digit = raw.slice(-1); 
		const next = [...value];
		next[index] = digit;
		emit(next);
		if (digit && index < 5) inputRefs.current[index + 1]?.focus();
	};

	const handlePaste = (e: React.ClipboardEvent) => {
		e.preventDefault();
		const digits = e.clipboardData.getData("Text").replace(/\D/g, "").slice(0, 6);
		if (digits.length === 0) return;
		const next = [...digits.split(""), ...Array(6).fill("")].slice(0, 6);
		emit(next);
		inputRefs.current[Math.min(digits.length, 5)]?.focus();
	};

	const handleKeyDown = (e: React.KeyboardEvent, index: number) => {
		if (e.key === "Backspace" && !value[index] && index > 0) {
			inputRefs.current[index - 1]?.focus();
		}
	};

	return (
		<div className="w-full flex justify-center space-x-1">
			{value.map((digit, index) => (
				<input
					key={index}
					type="text"
					inputMode="numeric"
					maxLength={1}
					value={digit}
					disabled={disabled}
					autoFocus={autoFocus && index === 0}
					onChange={(e) => handleChange(index, e.target.value)}
					onPaste={handlePaste}
					onKeyDown={(e) => handleKeyDown(e, index)}
					className="w-10 h-10 border border-zinc-300 bg-zinc-50 rounded-md text-center text-lg text-zinc-900 focus:outline-none focus:ring-1 focus:ring-blue-400 transition-colors disabled:opacity-50"
					ref={(el) => {
						inputRefs.current[index] = el;
					}}
				/>
			))}
		</div>
	);
}
