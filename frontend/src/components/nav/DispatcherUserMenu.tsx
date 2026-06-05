import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuthStore } from "../../auth/authStore";
import { queryClient } from "../../main";
import { LogOut, UserRoundCog, UserRound } from "lucide-react";
import { useOrgSettings } from "../../hooks/useOrg";

export default function DispatcherUserMenu() {
	const { user, logout } = useAuthStore();
	const [menuOpen, setMenuOpen] = useState(false);
	const wrapperRef = useRef<HTMLDivElement>(null);
	const navigate = useNavigate();
	const { data: org } = useOrgSettings(); // possibly add org logo to the menu in the future

	const handleLogout = () => {
		logout();
		queryClient.clear();
		navigate("/login");
	};

	useEffect(() => {
		const handleClickOutside = (e: MouseEvent) => {
			if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
				setMenuOpen(false);
			}
		};
		document.addEventListener("mousedown", handleClickOutside);
		return () => document.removeEventListener("mousedown", handleClickOutside);
	}, []);

	return (
		<div ref={wrapperRef} className="relative">
			<button
				onClick={() => setMenuOpen((o) => !o)}
				className={`w-9 h-9 rounded-lg bg-border-strong flex items-center justify-center text-on-primary font-semibold text-sm border-b-[3px] transition-colors ${
					menuOpen ? "border-primary" : "border-transparent hover:border-border"
				}`}
			>
				{user?.name.charAt(0).toUpperCase()}
			</button>

			{menuOpen && (
				<div className="absolute top-full right-0 mt-2 w-52 bg-surface-raised border border-border-subtle rounded-lg shadow-lg z-50 overflow-hidden">
					<div className="px-4 py-3 border-b border-border-subtle flex items-start gap-3">
						<span className="w-10 h-10 shrink-0 rounded-lg bg-border-strong flex items-center justify-center text-on-primary font-semibold text-sm">
							{user?.name.charAt(0).toUpperCase()}
						</span>
						<div className="min-w-0">
							<p className="text-sm font-semibold text-text-primary truncate">
								{user?.name.split("@")[0]}
							</p>
							<p className="text-xs text-text-muted truncate">{user?.name}</p>
							<p className="text-xs text-text-muted capitalize mt-0.5">{user?.role}</p>
							{org?.name && (
								<p className="text-xs text-text-muted truncate mt-0.5">{org.name}</p>
							)}
							
						</div>
					</div>

                    <div className="my-.25 border-t border-subtle" />
                    <div className="p-2 flex flex-col">
                        <button className="w-full flex items-center gap-1 px-3 py-2 text-sm text-text-primary rounded-md hover:bg-surface-raised transition-colors"
                            onClick={() => {
								navigate("/dispatch/dispatchers/" + user?.userId);
								setMenuOpen(false);
                            }}
                        >
                            <UserRound size={16} />
                            View Profile
                        </button>
                        <button
                            className="w-full flex items-center gap-1 px-3 py-2 text-sm text-text-primary rounded-md hover:bg-surface-raised transition-colors"
                            onClick={() => { navigate("/dispatch/user-settings"); setMenuOpen(false); }}
                        >
                            <UserRoundCog size={16} />
                            User Settings
                        </button>
                    </div>

					<div className="my-.25 border-t border-subtle" />
					<div className="p-2">
						<button
							onClick={handleLogout}
							className="w-full flex items-center gap-2 px-3 py-2 text-sm text-error-text rounded-md hover:bg-error-bg transition-colors"
						>
							<LogOut size={16} />
							Logout
						</button>
					</div>
				</div>
			)}
		</div>
	);
}
