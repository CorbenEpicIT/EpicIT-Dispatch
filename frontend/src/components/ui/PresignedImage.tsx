import type { ReactNode } from "react";
import { usePresignedUrls } from "../../hooks/useStorage";

interface PresignedImageProps {
	imageKey: string | null | undefined;
	alt: string;
	className?: string;
	skeletonClassName?: string;
	fallback?: ReactNode;
	onError?: () => void;
}

export default function PresignedImage({
	imageKey,
	alt,
	className = "",
	skeletonClassName = "",
	fallback = null,
	onError,
}: PresignedImageProps) {
	const { data: urlMap, isLoading } = usePresignedUrls(imageKey ? [imageKey] : []);

	if (!imageKey) return <>{fallback}</>;

	if (isLoading) {
		return (
			<div className={`animate-pulse bg-zinc-800 rounded-md ${skeletonClassName || className}`} />
		);
	}

	const url = urlMap?.[imageKey];
	if (!url) return <>{fallback}</>;

	return <img src={url} alt={alt} className={className} onError={onError} />;
}
