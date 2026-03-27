import { Outlet, useNavigate, useLocation } from "react-router-dom";
import { useAuthStore } from "../auth/authStore";
import { useRef, useEffect, useState } from "react";
import { ClipboardList, ArrowLeft, House } from "lucide-react";
import SideNavItem from "../components/nav/SideNavItem";

export default function TechnicianLayout() {
	const { user, logout } = useAuthStore();
	const navigate = useNavigate();
	const location = useLocation();
	const navigationCount = useRef(0);
	const [expanded, setExpanded] = useState(false);

	useEffect(() => {
		navigationCount.current++;
	}, [location.pathname]);

	const handleBack = () => {
		const historyIdx = (window.history.state as { idx?: number } | null)?.idx ?? 0;
		if (navigationCount.current > 1 && historyIdx > 0) {
			navigate(-1);
			return;
		}
		navigate("/technician");
	};

	const handleLogout = () => {
		logout();
		navigate("/login");
	};

	const ICON_SIZE = 20;

	return (
		<div className="flex h-screen bg-zinc-950 text-white">
			{/* SIDEBAR */}
			<aside
				onMouseEnter={() => setExpanded(true)}
				onMouseLeave={() => setExpanded(false)}
				className={`
					flex flex-col flex-shrink-0
					border-r border-zinc-900
					transition-all duration-300 ease-in-out
					${expanded ? "w-40 lg:w-44" : "w-16"}`}
			>
				<nav className="flex-1 py-2 space-y-1">
					<SideNavItem
						expanded={expanded}
						to="/technician"
						icon={<House size={ICON_SIZE} />}
						label="Dashboard"
					/>
					<SideNavItem
						expanded={expanded}
						to="/technician/visits"
						icon={<ClipboardList size={ICON_SIZE} />}
						label="My Visits"
					/>
				</nav>
			</aside>

			<div className="flex flex-col flex-1 overflow-hidden">
				{/* TOP NAV */}
				<header className="flex justify-between items-center px-6 h-14 bg-zinc-950 border-b border-zinc-900">
					<div className="flex items-center gap-6">
						<div className="font-semibold text-sm whitespace-nowrap">
							Tech Demo
						</div>
						<button
							onClick={handleBack}
							className="flex items-center gap-2 text-zinc-400 hover:text-white px-3 py-2 rounded-lg hover:bg-zinc-800 group"
						>
							<ArrowLeft
								size={18}
								className="group-hover:-translate-x-1 transition-transform"
							/>
							<span className="text-sm font-medium">
								Back
							</span>
						</button>
					</div>

					<div className="flex items-center gap-3">
						{user && (
							<span className="text-sm text-zinc-400">
								{user.name}
							</span>
						)}
						<button
							onClick={handleLogout}
							className="text-sm bg-red-500 px-3 py-1.5 rounded hover:bg-red-600"
						>
							Logout
						</button>
					</div>
				</header>

				<main className="flex-1 overflow-y-auto bg-zinc-950">
					<div className="p-4 md:p-6 min-h-full">
						<Outlet />
					</div>
				</main>
			</div>
		</div>
	);
}
