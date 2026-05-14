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
				className={`flex items-center justify-center bg-surface border border-border rounded-md ${height} ${className}`}
			>
				<ImageOff size={compact ? 24 : 32} className="text-text-faint" />
			</div>
		);
	}

	if (isLoading) {
		return (
			<div
				className={`animate-pulse bg-surface border border-border rounded-md ${height} ${className}`}
			/>
		);
	}

	const images = imageKeys.map((k) => urlMap?.[k]).filter(Boolean) as string[];
	return <ImageCarousel images={images} compact={compact} className={className} />;
}
