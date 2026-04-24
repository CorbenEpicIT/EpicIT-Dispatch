import { useState } from "react";
import { ChevronLeft, ChevronRight, ImageOff } from "lucide-react";

interface ImageCarouselProps {
	images: string[];
	compact?: boolean;
	className?: string;
}

export default function ImageCarousel({
	images,
	compact = false,
	className = "",
}: ImageCarouselProps) {
	const [currentIndex, setCurrentIndex] = useState(0);

	if (!images.length) {
		return (
			<div
				className={`flex items-center justify-center bg-zinc-800 border border-zinc-700 rounded-md ${
					compact ? "h-30" : "h-48"
				} ${className}`}
			>
				<ImageOff size={compact ? 24 : 32} className="text-zinc-600" />
			</div>
		);
	}

	const goTo = (index: number) => {
		setCurrentIndex((index + images.length) % images.length);
	};

	return (
		<div className={`relative group ${className}`}>
			<img
				src={images[currentIndex]}
				alt={`Image ${currentIndex + 1}`}
				className={`w-full object-cover border border-zinc-700 rounded-md ${
					compact ? "h-30" : "h-48"
				}`}
			/>

			{images.length > 1 && (
				<>
					<button
						type="button"
						onClick={(e) => {
							e.stopPropagation();
							goTo(currentIndex - 1);
						}}
						className="absolute left-1 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-black/60 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
					>
						<ChevronLeft size={14} />
					</button>
					<button
						type="button"
						onClick={(e) => {
							e.stopPropagation();
							goTo(currentIndex + 1);
						}}
						className="absolute right-1 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-black/60 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
					>
						<ChevronRight size={14} />
					</button>

					{/* Dot indicators */}
					<div className="absolute bottom-1.5 left-1/2 -translate-x-1/2 flex gap-1">
						{images.map((_, i) => (
							<button
								key={i}
								type="button"
								onClick={(e) => {
									e.stopPropagation();
									goTo(i);
								}}
								className={`w-1.5 h-1.5 rounded-full transition-colors ${
									i === currentIndex
										? "bg-white"
										: "bg-white/40"
								}`}
							/>
						))}
					</div>
				</>
			)}
		</div>
	);
}
