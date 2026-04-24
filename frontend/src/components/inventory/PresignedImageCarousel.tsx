import { ImageOff } from "lucide-react";
import { usePresignedUrls } from "../../hooks/useStorage";
import ImageCarousel from "./ImageCarousel";

interface PresignedImageCarouselProps {
	imageKeys: string[];
	compact?: boolean;
	className?: string;
}

export default function PresignedImageCarousel({
	imageKeys,
	compact = false,
	className = "",
}: PresignedImageCarouselProps) {
	const height = compact ? "h-30" : "h-48";
	const { data: urlMap, isLoading } = usePresignedUrls(imageKeys);

	if (!imageKeys.length) {
		return (
			<div
				className={`flex items-center justify-center bg-zinc-800 border border-zinc-700 rounded-md ${height} ${className}`}
			>
				<ImageOff size={compact ? 24 : 32} className="text-zinc-600" />
			</div>
		);
	}

	if (isLoading) {
		return (
			<div
				className={`animate-pulse bg-zinc-800 border border-zinc-700 rounded-md ${height} ${className}`}
			/>
		);
	}

	const images = imageKeys.map((k) => urlMap?.[k]).filter(Boolean) as string[];
	return <ImageCarousel images={images} compact={compact} className={className} />;
}
