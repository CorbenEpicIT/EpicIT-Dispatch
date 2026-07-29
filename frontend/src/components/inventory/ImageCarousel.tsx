import { useState, useEffect } from "react";
import { ChevronLeft, ChevronRight, ImageOff } from "lucide-react";

interface ImageCarouselProps {
	images: string[];
	compact?: boolean;
	compactNav?: boolean;
	contain?: boolean;
	maxHeight?: string;
	index?: number;
	onIndexChange?: (i: number) => void;
	className?: string;
}

export default function ImageCarousel({
	images,
	compact = false,
	compactNav = false,
	contain = false,
	maxHeight = "max-h-[70vh]",
	index,
	onIndexChange,
	className = "",
}: ImageCarouselProps) {
	const [currentIndex, setCurrentIndex] = useState(index ?? 0);
	const [status, setStatus] = useState<"loading" | "loaded" | "error">("loading");

	const height = compact ? "h-30" : "h-48";

	// Sync a controlled index in from the parent (chip clicks, etc.)
	useEffect(() => {
		if (index != null && index !== currentIndex) {
			setCurrentIndex(index);
			setStatus("loading");
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [index]);

	if (!images.length) {
		return (
			<div
				className={`flex items-center justify-center bg-surface border border-border rounded-md ${height} ${className}`}
			>
				<ImageOff size={compact ? 24 : 32} className="text-text-faint" />
			</div>
		);
	}

	const goTo = (index: number) => {
		const next = (index + images.length) % images.length;
		setCurrentIndex(next);
		setStatus("loading");
		onIndexChange?.(next);
	};

	return (
		<div className={`relative group ${contain ? (status === "loaded" ? "" : height) : height} ${className}`}>
			{/* Shimmer while image is fetching */}
			{status === "loading" && (
				<div className="absolute inset-0 animate-pulse bg-surface rounded-md border border-border" />
			)}

			{/* Error fallback */}
			{status === "error" && (
				<div className="absolute inset-0 flex items-center justify-center bg-surface rounded-md border border-border">
					<ImageOff size={compact ? 20 : 28} className="text-text-faint" />
				</div>
			)}

			<img
				key={currentIndex}
				ref={(node) => {
					// Cached images can finish loading before React attaches onLoad
					if (node?.complete && node.naturalWidth > 0) {
						setStatus("loaded");
					}
				}}
				src={images[currentIndex]}
				alt={`Image ${currentIndex + 1}`}
				onLoad={() => setStatus("loaded")}
				onError={() => setStatus("error")}
				className={
					contain
						? `block w-full h-auto ${maxHeight} object-contain border border-border rounded-md transition-opacity duration-150 ${
								status === "loaded" ? "opacity-100" : "opacity-0"
							}`
						: `absolute inset-0 w-full h-full object-cover border border-border rounded-md transition-opacity duration-150 ${
								status === "loaded" ? "opacity-100" : "opacity-0"
							}`
				}
			/>

			{images.length > 1 && compactNav && (
				<div className="absolute bottom-1 left-1/2 -translate-x-1/2 z-10 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
					<button
						type="button"
						onClick={(e) => { e.stopPropagation(); goTo(currentIndex - 1); }}
						className="w-4 h-4 rounded-sm bg-black/55 text-white flex items-center justify-center"
					>
						<ChevronLeft size={10} />
					</button>
					<button
						type="button"
						onClick={(e) => { e.stopPropagation(); goTo(currentIndex + 1); }}
						className="w-4 h-4 rounded-sm bg-black/55 text-white flex items-center justify-center"
					>
						<ChevronRight size={10} />
					</button>
				</div>
			)}
			{images.length > 1 && !compactNav && (
				<>
					<button
						type="button"
						onClick={(e) => { e.stopPropagation(); goTo(currentIndex - 1); }}
						className="absolute left-1 top-1/2 -translate-y-1/2 z-10 w-6 h-6 rounded-full bg-black/60 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
					>
						<ChevronLeft size={14} />
					</button>
					<button
						type="button"
						onClick={(e) => { e.stopPropagation(); goTo(currentIndex + 1); }}
						className="absolute right-1 top-1/2 -translate-y-1/2 z-10 w-6 h-6 rounded-full bg-black/60 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
					>
						<ChevronRight size={14} />
					</button>
					<div className="absolute bottom-1.5 left-1/2 -translate-x-1/2 z-10 flex gap-1">
						{images.map((_, i) => (
							<button
								key={i}
								type="button"
								onClick={(e) => { e.stopPropagation(); goTo(i); }}
								className={`w-1.5 h-1.5 rounded-full transition-colors ${i === currentIndex ? "bg-white" : "bg-white/40"}`}
							/>
						))}
					</div>
				</>
			)}
		</div>
	);
}
