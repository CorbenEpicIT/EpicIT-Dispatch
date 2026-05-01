import { useState, useEffect } from "react";
import { Search } from "lucide-react";
import { useNavigate, useLocation, useSearchParams } from "react-router-dom";

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
	const navigate = useNavigate();
	const location = useLocation();
	const [searchParams] = useSearchParams();
	const committed = searchParams.get(paramKey) ?? "";
	const [value, setValue] = useState(committed);

	useEffect(() => {
		setValue(committed);
		onValueChange?.(committed);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [committed]);

	const handleChange = (v: string) => {
		setValue(v);
		onValueChange?.(v);
	};

	const handleSubmit = (e: React.FormEvent) => {
		e.preventDefault();
		const newParams = new URLSearchParams(location.search);
		if (value.trim()) {
			newParams.set(paramKey, value.trim());
		} else {
			newParams.delete(paramKey);
		}
		navigate(`${location.pathname}?${newParams.toString()}`);
	};

	return (
		<form onSubmit={handleSubmit} className={`relative w-full ${className ?? ""}`}>
			<Search
				size={18}
				className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"
			/>
			<input
				type="text"
				placeholder={placeholder}
				value={value}
				onChange={(e) => handleChange(e.target.value)}
				className="w-full pl-11 pr-3 py-2 rounded-md bg-zinc-800 border border-zinc-700 text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
			/>
		</form>
	);
}

function ControlledSearchBar({ placeholder, value, onChange, className }: ControlledProps) {
	return (
		<div className={`relative ${className ?? "w-full"}`}>
			<Search
				size={16}
				className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"
			/>
			<input
				type="text"
				placeholder={placeholder}
				value={value}
				onChange={(e) => onChange(e.target.value)}
				className="w-full pl-9 pr-3 py-2 rounded-md bg-zinc-800 border border-zinc-700 text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
			/>
		</div>
	);
}
