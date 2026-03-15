import type { ReactNode } from "react";

interface CardProps {
	title?: string;
	headerAction?: ReactNode;
	children: ReactNode;
	className?: string;
}

export default function Card({ title, headerAction, children, className = "" }: CardProps) {
	return (
		<div
			className={`bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden flex flex-col ${className}`}
		>
			{title && (
				<div className="flex items-center justify-between p-4 border-b border-zinc-800">
					<h3 className="font-semibold text-white">{title}</h3>
					{headerAction && <div>{headerAction}</div>}
				</div>
			)}
			<div className="p-4 flex-1 flex flex-col">{children}</div>
		</div>
	);
}
