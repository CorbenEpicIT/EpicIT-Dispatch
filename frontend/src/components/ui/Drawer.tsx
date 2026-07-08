import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

interface DrawerProps {
	isOpen: boolean;
	onClose: () => void;
	title: string;
	children: ReactNode;
}

export default function Drawer({ isOpen, onClose, title, children }: DrawerProps) {
	const [mounted, setMounted] = useState(false);
	const [visible, setVisible] = useState(false);

	useEffect(() => {
		if (isOpen) {
			setMounted(true);
			const id = setTimeout(() => setVisible(true), 10);
			return () => clearTimeout(id);
		}
		setVisible(false);
		const id = setTimeout(() => setMounted(false), 200);
		return () => clearTimeout(id);
	}, [isOpen]);

	useEffect(() => {
		if (!isOpen) return;
		const onKey = (e: KeyboardEvent) => {
			if (e.key === "Escape") onClose();
		};
		document.addEventListener("keydown", onKey);
		return () => document.removeEventListener("keydown", onKey);
	}, [isOpen, onClose]);

	if (!mounted) return null;

	return createPortal(
		<div className="fixed inset-0 z-[5000]">
			<div
				onMouseDown={onClose}
				className={`absolute inset-0 bg-black transition-opacity duration-200 ${
					visible ? "opacity-50" : "opacity-0"
				}`}
			/>
			<div
				role="dialog"
				aria-label={title}
				className={`absolute top-0 right-0 h-full w-[calc(100%-2rem)] sm:w-[clamp(340px,32vw,420px)] bg-surface border-l border-border-card shadow-xl flex flex-col transition-transform duration-200 ease-out ${
					visible ? "translate-x-0" : "translate-x-full"
				}`}
			>
				<div className="flex items-center justify-between px-5 py-4 border-b border-border-subtle shrink-0">
					<h2 className="text-base font-semibold text-text-primary">{title}</h2>
					<button
						onClick={onClose}
						aria-label="Close"
						className="text-text-muted hover:text-text-primary p-1 -mr-1 rounded-md hover:bg-surface-raised transition-colors"
					>
						<X size={16} />
					</button>
				</div>
				<div className="flex-1 overflow-y-auto">{children}</div>
			</div>
		</div>,
		document.body,
	);
}
