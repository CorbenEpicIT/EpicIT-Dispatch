import { NavLink } from "react-router-dom";

export default function SideNavItem({
	to,
	icon,
	label,
	expanded,
}: {
	to: string;
	icon: React.ReactNode;
	label: string;
	expanded: boolean;
}) {
	return (
		<NavLink
			to={to}
			end
			className={({ isActive }) =>
				`
				group relative flex items-center h-10 rounded-md mx-2
				transition-colors duration-200
				${isActive ? "bg-zinc-900 text-white" : "text-zinc-400 hover:text-white hover:bg-zinc-800"}
				`
			}
		>
			{/* Icon container - fixed at collapsed sidebar width for alignment */}
			<div className="w-12 flex items-center justify-center flex-shrink-0">
				{icon}
			</div>

			{/* Label - constrained width to reduce right-side empty space */}
			<div
				className={`
					absolute left-12 flex items-center h-full overflow-hidden
					transition-all duration-200 ease-in-out
					${expanded ? "opacity-100 translate-x-0 w-24" : "opacity-0 -translate-x-2 pointer-events-none w-0"}
				`}
			>
				<span className="text-sm whitespace-nowrap truncate w-full pr-2">
					{label}
				</span>
			</div>
		</NavLink>
	);
}
