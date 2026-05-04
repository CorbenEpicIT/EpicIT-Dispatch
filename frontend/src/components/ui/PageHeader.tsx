interface PageHeaderProps {
	title: string;
	subtitle?: React.ReactNode;
	children?: React.ReactNode;
}

export default function PageHeader({ title, subtitle, children }: PageHeaderProps) {
	return (
		<div className="flex items-center justify-between mb-3">
			<div>
				<h2 className="text-2xl font-semibold">{title}</h2>
				{subtitle && <div className="mt-0.5">{subtitle}</div>}
			</div>
			{children && <div className="flex items-center gap-2">{children}</div>}
		</div>
	);
}
