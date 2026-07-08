import { useEffect, useRef, useState } from "react";
import { Star, ChevronDown } from "lucide-react";
import { Link } from "react-router-dom";
import type { ReportFavoriteKind } from "../../types/reports";

export interface FavoriteLink {
	title: string;
	description: string;
	to: string;
	kind: ReportFavoriteKind;
	ref: string;
}

interface FavoritesButtonProps {
	favorites: FavoriteLink[];
	onRemove: (kind: ReportFavoriteKind, ref: string) => void;
}

export default function FavoritesButton({ favorites, onRemove }: FavoritesButtonProps) {
	const [open, setOpen] = useState(false);
	const containerRef = useRef<HTMLDivElement>(null);

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

	return (
		<div className="relative" ref={containerRef}>
			<button
				type="button"
				onClick={() => setOpen((o) => !o)}
				aria-expanded={open}
				aria-haspopup="menu"
				className="flex items-center gap-1.5 h-9 px-3 rounded-md border text-sm font-medium transition-colors cursor-pointer whitespace-nowrap bg-surface border-border text-text-tertiary hover:text-text-primary"
			>
				<Star size={15} className="shrink-0" fill="currentColor" />
				<span>Favorites</span>
				<ChevronDown size={14} className="shrink-0" />
			</button>

			{open && (
				<div
					role="menu"
					aria-label="Favorite reports"
					className="absolute right-0 mt-1.5 min-w-44 max-h-96 overflow-y-auto bg-canvas border border-border-strong rounded-lg shadow-2xl shadow-black/50 z-50"
				>
					{favorites.length === 0 ? (
						<p className="px-3 py-1.5 text-sm text-text-muted">
							No favorites yet — star a report to pin it here.
						</p>
					) : (
						<div className="py-1 px-1">
							{favorites.map((fav) => (
								<Link
									key={`${fav.kind}:${fav.ref}`}
									to={fav.to}
									onClick={() => setOpen(false)}
									className="w-full flex items-center justify-between gap-3 px-3 py-1.5 text-sm rounded text-left text-text-secondary hover:bg-surface/70"
								>
									<span className="truncate">{fav.title}</span>
									<button
										type="button"
										aria-label="Remove from favorites"
										onClick={(e) => {
											e.preventDefault();
											e.stopPropagation();
											onRemove(fav.kind, fav.ref);
										}}
										className="shrink-0 text-warning hover:text-warning"
									>
										<Star size={14} fill="currentColor" />
									</button>
								</Link>
							))}
						</div>
					)}
				</div>
			)}
		</div>
	);
}
