import { Outlet, useNavigate, useLocation, NavLink } from "react-router-dom";
import { useAuthStore } from "../auth/authStore";
import { useRef, useEffect } from "react";
import { ClipboardList, ArrowLeft, House } from "lucide-react";

export default function TechnicianLayout() {
	const { user, logout } = useAuthStore();
	const navigate = useNavigate();
	const location = useLocation();
	const navigationCount = useRef(0);

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

	return (
		<div className="flex h-screen bg-zinc-950 text-white">
			<div className="flex flex-col flex-1 overflow-hidden">
				{/* TOP NAV */}
				<header className="flex justify-between items-center px-4 sm:px-6 h-14 bg-zinc-950 border-b border-zinc-900">
					<div className="flex items-center gap-3 sm:gap-6">
						<div className="font-semibold text-sm whitespace-nowrap">
							Tech Demo
						</div>
						<button
							onClick={handleBack}
							className="flex items-center gap-2 text-zinc-400 hover:text-white px-2 sm:px-3 py-2 rounded-lg hover:bg-zinc-800 group"
						>
							<ArrowLeft
								size={18}
								className="group-hover:-translate-x-1 transition-transform"
							/>
							<span className="hidden sm:inline text-sm font-medium">
								Back
							</span>
						</button>
					</div>

					<div className="flex items-center gap-3">
						{user && (
							<span className="hidden sm:block text-sm text-zinc-400">
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
					<div className="p-4 pb-20 md:px-6 md:pt-6 min-h-full">
						<Outlet />
					</div>
				</main>
			</div>

			{/* BOTTOM NAV */}
			<nav className="flex fixed bottom-0 left-0 right-0 z-50 bg-zinc-950 border-t border-zinc-900 h-16">
				<NavLink
					to="/technician"
					end
					className={({ isActive }) =>
						`flex flex-1 flex-col items-center justify-center gap-1 text-xs transition-colors ${
							isActive ? "text-white" : "text-zinc-500 hover:text-zinc-300"
						}`
					}
				>
					<House size={22} />
					<span>Dashboard</span>
				</NavLink>
				<NavLink
					to="/technician/visits"
					className={({ isActive }) =>
						`flex flex-1 flex-col items-center justify-center gap-1 text-xs transition-colors ${
							isActive ? "text-white" : "text-zinc-500 hover:text-zinc-300"
						}`
					}
				>
					<ClipboardList size={22} />
					<span>My Visits</span>
				</NavLink>
			</nav>
		</div>
	);
}
