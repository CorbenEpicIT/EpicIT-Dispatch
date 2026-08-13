import Dropdown from "../Dropdown";
import { UNITS, unitGroupsForSystem, type UnitCode } from "../../../lib/units";
import { useOrgSettings } from "../../../hooks/useOrg";

// Grouped NATIVE select, not a custom combobox — native gets keyboard nav,
// type-to-jump, and touch behavior for free at only 45 options; not worth a
// bespoke listbox at this size.
/**
 * Parenthetical names the word that appears beside a quantity (e.g. "Each
 * (units)"); omitted when redundant (e.g. "Boxes (boxes)"). Keyed on that
 * redundancy itself, not `kind === "container"`, so it stays correct if
 * another unit reads the same way.
 */
function optionText(code: UnitCode): string {
	const { label, plural } = UNITS[code];
	return label.toLowerCase() === plural.toLowerCase() ? label : `${label} (${plural})`;
}

export default function UnitSelect({
	value,
	onChange,
	disabled,
	id,
}: {
	value: UnitCode;
	onChange: (next: UnitCode) => void;
	disabled?: boolean;
	id?: string;
}) {
	// Read here, not passed as a prop — it's a cached query the settings page
	// already shares. Ordering only (see unitGroupsForSystem); a slow/failed
	// fetch degrades to catalog order, never to a missing unit.
	const { data: org } = useOrgSettings();
	const groups = unitGroupsForSystem(org?.measurement_system);

	return (
		<Dropdown
			id={id}
			aria-label="Unit of measure"
			value={value}
			disabled={disabled}
			// The select can only emit catalog codes, so nothing downstream has
			// to normalize or validate what comes out of here.
			onChange={(next) => onChange(next as UnitCode)}
			entries={groups.map((group) => (
				<optgroup key={group.kind} label={group.label}>
					{group.codes.map((code) => (
						<option key={code} value={code}>
							{optionText(code)}
						</option>
					))}
				</optgroup>
			))}
		/>
	);
}
