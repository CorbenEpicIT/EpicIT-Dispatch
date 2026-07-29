import { Lock } from "lucide-react";
import type { TaxGroup } from "../../../types/tax";
import { formatTaxGroupLabel } from "../../../types/tax";

interface TaxGroupSelectorProps {
	value: string | null;
	taxable: boolean;
	taxGroups: TaxGroup[];
	clientExempt: boolean;
	onChange: (tax_group_id: string | null, taxable: boolean) => void;
	disabled?: boolean;
}

const TaxGroupSelector = ({
	value,
	taxable,
	taxGroups,
	clientExempt,
	onChange,
	disabled = false,
}: TaxGroupSelectorProps) => {
	if (clientExempt) {
		return (
			<div className="flex items-center gap-1.5 h-[34px] px-2.5 rounded border border-border bg-base text-text-muted text-sm select-none">
				<Lock size={12} className="flex-shrink-0 text-text-faint" />
				<span>Tax Exempt</span>
			</div>
		);
	}

	const selectValue = taxable && value ? value : "none";

	const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
		const selected = e.target.value;
		if (selected === "none") {
			onChange(null, false);
		} else {
			onChange(selected, true);
		}
	};

	return (
		<div
			className={[
				"relative w-full h-[34px] border border-border rounded bg-base overflow-hidden transition-colors",
				!disabled && "hover:border-border-strong focus-within:border-primary",
				disabled && "opacity-60",
			]
				.filter(Boolean)
				.join(" ")}
		>
			<select
				value={selectValue}
				onChange={handleChange}
				disabled={disabled}
				className={`appearance-none w-full h-full px-2.5 pr-7 bg-base text-sm border-0 outline-none focus:ring-0 disabled:cursor-not-allowed [&>option]:bg-base [&>option]:text-text-primary
					${selectValue === "none" ? "text-text-muted" : "text-text-primary"}`}
			>
				<option value="none">No Tax</option>
				{taxGroups.length === 0 ? (
					<option value="" disabled>
						No tax groups configured
					</option>
				) : (
					taxGroups.map((group) => (
						<option key={group.id} value={group.id}>
							{formatTaxGroupLabel(group)}
						</option>
					))
				)}
			</select>
			{/* Arrow matches Dropdown component */}
			<svg
				className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-text-tertiary"
				width="10"
				height="6"
				viewBox="0 0 10 6"
				fill="none"
				aria-hidden="true"
			>
				<path d="M1 1L5 5L9 1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
			</svg>
		</div>
	);
};

export default TaxGroupSelector;
export type { TaxGroupSelectorProps };
