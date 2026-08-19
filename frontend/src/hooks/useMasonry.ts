import { useEffect, useRef, useCallback } from "react";
import Masonry from "masonry-layout";

//Will need virtualization for handling many items

interface UseMasonryOptions {
	columnWidth?: number | string;
	gutter?: number;
	horizontalOrder?: boolean;
	percentPosition?: boolean;
	itemSelector: string;
	fitWidth?: boolean;
}

interface UseMasonryReturn {
	containerRef: React.RefObject<HTMLDivElement | null>;
	layout: () => void;
	masonry: Masonry | null;
}

export function useMasonry(
	dependencies: React.DependencyList = [],
	options: UseMasonryOptions = { itemSelector: ".masonry-item" }
): UseMasonryReturn {
	const containerRef = useRef<HTMLDivElement | null>(null);
	const masonryRef = useRef<Masonry | null>(null);

	const initMasonry = useCallback(() => {
		if (!containerRef.current) return;
		if (masonryRef.current) return;

		const items = containerRef.current.querySelectorAll(options.itemSelector);
		if (items.length === 0) return;

		masonryRef.current = new Masonry(containerRef.current, {
			itemSelector: options.itemSelector,
			columnWidth: options.columnWidth || options.itemSelector,
			gutter: options.gutter ?? 16,
			horizontalOrder: options.horizontalOrder ?? false,
			percentPosition: options.percentPosition ?? false,
			fitWidth: options.fitWidth ?? true,
			transitionDuration: ".15s",
		});
	}, [
		options.itemSelector,
		options.columnWidth,
		options.gutter,
		options.horizontalOrder,
		options.percentPosition,
		options.fitWidth,
	]);

	const layout = useCallback(() => {
		masonryRef.current?.layout?.();
	}, []);

	useEffect(() => {
		const timer = setTimeout(initMasonry, 50);
		return () => clearTimeout(timer);
	}, [initMasonry, ...dependencies]);

	useEffect(() => {
		return () => {
			masonryRef.current?.destroy?.();
			masonryRef.current = null;
		};
	}, []);

	return {
		containerRef,
		layout,
		masonry: masonryRef.current,
	};
}
