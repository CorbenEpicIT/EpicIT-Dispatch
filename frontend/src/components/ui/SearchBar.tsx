import { useState, useEffect, useRef } from "react";
import { Search } from "lucide-react";
import { useSearchParams } from "react-router-dom";

type UrlParamProps = {
	placeholder: string;
	paramKey: string;
	onValueChange?: (v: string) => void;
	className?: string;
};

type ControlledProps = {
	placeholder: string;
	value: string;
	onChange: (v: string) => void;
	className?: string;
};

type SearchBarProps = UrlParamProps | ControlledProps;

export default function SearchBar(props: SearchBarProps) {
	if ("paramKey" in props) {
		return <UrlParamSearchBar {...props} />;
	}
	return <ControlledSearchBar {...props} />;
}

function UrlParamSearchBar({ placeholder, paramKey, onValueChange, className }: UrlParamProps) {
	const [searchParams, setSearchParams] = useSearchParams();
	const committed = searchParams.get(paramKey) ?? "";
	const [value, setValue] = useState(committed);
	const onValueChangeRef = useRef(onValueChange);

	useEffect(() => {
		onValueChangeRef.current = onValueChange;
	});

	useEffect(() => {
		setValue(committed);
		onValueChangeRef.current?.(committed);
	}, [committed]);

	const handleChange = (v: string) => {
		setValue(v);
		onValueChange?.(v);
	};

	const handleSubmit = (e: React.FormEvent) => {
		e.preventDefault();
		const next = new URLSearchParams(searchParams);
		if (value.trim()) {
			next.set(paramKey, value.trim());
		} else {
			next.delete(paramKey);
		}
		setSearchParams(next);
	};

	return (
		<form onSubmit={handleSubmit} className={`relative ${className ?? "w-full"}`}>
			<Search
				size={16}
				className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none"
			/>
			<input
				type="text"
				placeholder={placeholder}
				value={value}
				onChange={(e) => handleChange(e.target.value)}
				className="w-full pl-9 pr-3 py-2 rounded-md bg-zinc-800 border border-zinc-700 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
			/>
		</form>
	);
}

function ControlledSearchBar({ placeholder, value, onChange, className }: ControlledProps) {
	return (
		<div className={`relative ${className ?? "w-full"}`}>
			<Search
				size={16}
				className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none"
			/>
			<input
				type="text"
				placeholder={placeholder}
				value={value}
				onChange={(e) => onChange(e.target.value)}
				className="w-full pl-9 pr-3 py-2 rounded-md bg-zinc-800 border border-zinc-700 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
			/>
		</div>
	);
}
