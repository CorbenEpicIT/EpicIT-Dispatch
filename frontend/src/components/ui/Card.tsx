import type { ReactNode } from "react";

interface CardProps {
	title?: string;
	headerAction?: ReactNode;
	children: ReactNode;
	className?: string;
	scrollable?: boolean;
}

export default function Card({ title, headerAction, children, className = "", scrollable = false }: CardProps) {
	return (
		<div
			className={`bg-base border border-border-subtle rounded-xl overflow-hidden flex flex-col ${className}`}
		>
			{title && (
				/* Wraps rather than nowrap because a card is no longer always
				   full width: the invoice Payments card sits in a ~285px rail,
				   where its title plus Record and Refund need exactly the row it
				   has and touched with no gutter between them. Inert wherever the
				   row has slack — every other card header measured the same
				   height before and after. */
				<div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 p-4 border-b border-border-subtle">
					<h3 className="font-semibold text-text-primary">{title}</h3>
					{headerAction && <div>{headerAction}</div>}
				</div>
			)}
			<div className={`p-4 flex-1 flex flex-col min-h-0${scrollable ? " widget-scroll" : ""}`}>{children}</div>
		</div>
	);
}
