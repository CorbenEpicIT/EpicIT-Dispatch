import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { MoreVertical } from "lucide-react";

export interface DocumentMenuItem {
	id: string;
	label: string;
	icon?: ReactNode;
	/** warning = dispute-adjacent; destructive = kills the document. */
	intent?: "neutral" | "warning" | "destructive";
	disabled?: boolean;
	/**
	 * Why it is closed. Rendered as visible text under the label, not only as a
	 * `title`: these items are `aria-disabled` rather than natively disabled
	 * precisely so the reason reaches a keyboard or touch user, who never gets
	 * a hover tooltip. Unavailable actions are shown with their reason, never
	 * omitted (spec 3.1).
	 */
	disabledReason?: string;
	onSelect: () => void;
	/**
	 * Leave the menu open after activation. The two-step delete confirm needs
	 * it — the first click only arms the second.
	 */
	keepOpen?: boolean;
}

export interface DocumentMenuGroup {
	id: string;
	/** The group's heading, which is what keeps the two kinds of action distinct. */
	label: string;
	items: DocumentMenuItem[];
}

interface DocumentDetailHeaderProps {
	/** The document number. */
	title: string;
	/** Version / superseded / overdue / QuickBooks pills, beside the title. */
	badges?: ReactNode;
	/** The one line under the title: dates, memo, whatever the document leads with. */
	meta?: ReactNode;
	/** The status pill — the ONLY place the status word appears on the page. */
	statusPill?: ReactNode;
	/** Buttons that earn a permanent slot beside the pill (invoice's QuickBooks sync). */
	inlineActions?: ReactNode;
	menuGroups: DocumentMenuGroup[];
	/** e.g. "Quote actions" — a bare "More options" gives a screen reader nothing. */
	menuLabel: string;
	/** Fired when the menu closes, so a page can disarm a two-step confirm. */
	onMenuClose?: () => void;
}

const INTENT_TEXT: Record<NonNullable<DocumentMenuItem["intent"]>, string> = {
	neutral: "text-text-secondary",
	warning: "text-warning-text",
	destructive: "text-error-text",
};

/**
 * Identity, status and — critically — the page's ONE options button.
 *
 * Both detail pages used to render a kebab here AND let LifecycleBar render a
 * second overflow menu an inch below it, with different contents and no label
 * on either. Spec 3.4's split survives as two labeled groups inside this single
 * menu: lifecycle actions (the bar's overflow, destructive included) above
 * utility actions. The bar keeps the *legible* lifecycle actions as buttons, so
 * acceptance criterion 1 — position and legal next actions visible without
 * opening a menu — is unaffected by the merge.
 *
 * Shared by quote and invoice so criterion 9's "same component, vocabulary and
 * layout" is structural rather than maintained by hand; the two pages had
 * already drifted on banner placement and kebab semantics.
 */
export default function DocumentDetailHeader({
	title,
	badges,
	meta,
	statusPill,
	inlineActions,
	menuGroups,
	menuLabel,
	onMenuClose,
}: DocumentDetailHeaderProps) {
	const [open, setOpen] = useState(false);
	// Which item owns the single tab stop. Real roving tabindex: keying it off a
	// fixed index instead only appeared to work because the menu resets focus to
	// the first item on open and closes on Tab.
	const [focusedIndex, setFocusedIndex] = useState(0);
	const menuId = useId();
	const wrapRef = useRef<HTMLDivElement>(null);
	const triggerRef = useRef<HTMLButtonElement>(null);
	const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);

	const groups = menuGroups.filter((g) => g.items.length > 0);
	// Flat order for arrow-key movement: a menu is one focus ring, not one per
	// group.
	const flat = groups.flatMap((g) => g.items);

	// Read through a ref so `close` is stable. Both pages pass an inline arrow
	// for onMenuClose, which as a dependency made `close` — and therefore the
	// document-level mousedown listener below — tear down and re-subscribe on
	// every unrelated re-render while the menu was open.
	const onMenuCloseRef = useRef(onMenuClose);
	useEffect(() => {
		onMenuCloseRef.current = onMenuClose;
	});

	const close = useCallback((refocus: boolean) => {
		setOpen(false);
		onMenuCloseRef.current?.();
		if (refocus) triggerRef.current?.focus();
	}, []);

	useEffect(() => {
		if (!open) return;
		const onMouseDown = (event: MouseEvent) => {
			if (wrapRef.current && !wrapRef.current.contains(event.target as Node)) {
				close(false);
			}
		};
		document.addEventListener("mousedown", onMouseDown);
		return () => document.removeEventListener("mousedown", onMouseDown);
	}, [open, close]);

	// Opening a menu moves focus into it, or the keyboard user is left on the
	// trigger with no way to know the list appeared.
	useEffect(() => {
		if (!open) return;
		setFocusedIndex(0);
		itemRefs.current[0]?.focus();
	}, [open]);

	const moveFocus = (from: number, key: string) => {
		const last = flat.length - 1;
		let next: number | null = null;
		if (key === "ArrowDown") next = from === last ? 0 : from + 1;
		else if (key === "ArrowUp") next = from === 0 ? last : from - 1;
		else if (key === "Home") next = 0;
		else if (key === "End") next = last;
		if (next === null) return false;
		setFocusedIndex(next);
		itemRefs.current[next]?.focus();
		return true;
	};

	// Runs during the render below, assigning each item its position in `flat`.
	let flatIndex = -1;

	return (
		<div className="flex items-start justify-between gap-4">
			<div className="min-w-0 flex-1">
				<div className="mb-1 flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
					<h1
						className="min-w-0 break-words text-3xl font-bold text-text-primary"
						title={title}
					>
						{title}
					</h1>
					{badges}
				</div>
				{meta && <div className="min-w-0 text-sm text-text-tertiary">{meta}</div>}
			</div>

			<div className="flex flex-shrink-0 flex-wrap items-center justify-end gap-3">
				{statusPill}
				{inlineActions}

				{groups.length > 0 && (
					<div className="relative" ref={wrapRef}>
						<button
							ref={triggerRef}
							type="button"
							aria-label={menuLabel}
							aria-haspopup="menu"
							aria-expanded={open}
							aria-controls={open ? menuId : undefined}
							onClick={() => (open ? close(false) : setOpen(true))}
							onKeyDown={(e) => {
								if (e.key !== "ArrowDown") return;
								e.preventDefault();
								setOpen(true);
							}}
							className="rounded-md border border-border p-2 transition-colors duration-150 ease-out hover:border-border-strong hover:bg-surface"
						>
							<MoreVertical size={20} />
						</button>

						{open && (
							<div
								id={menuId}
								role="menu"
								aria-label={menuLabel}
								className="absolute right-0 z-50 mt-2 w-72 rounded-lg border border-border-subtle bg-base py-1 shadow-xl"
								onKeyDown={(e) => {
									if (e.key === "Escape") {
										e.preventDefault();
										close(true);
									} else if (e.key === "Tab") {
										// Tabbing out closes,
										// rather than leaving an
										// orphaned popover behind
										// the next focus stop.
										close(false);
									}
								}}
							>
								{groups.map((group, groupIndex) => (
									<div
										key={group.id}
										role="group"
										aria-labelledby={`docmenu-${group.id}`}
									>
										{groupIndex > 0 && (
											// Decorative: the group headings
											// carry the split for AT, and an
											// unroled div inside role="menu"
											// is not a valid owned element.
											<div
												aria-hidden="true"
												className="my-1 border-t border-border-subtle"
											/>
										)}
										<div
											id={`docmenu-${group.id}`}
											className="px-4 pt-1.5 pb-1 text-[10px] font-semibold uppercase tracking-wider text-text-muted"
										>
											{group.label}
										</div>
										{group.items.map((item) => {
											flatIndex++;
											const index = flatIndex;
											return (
												<MenuItemButton
													key={item.id}
													item={item}
													index={index}
													focused={
														index ===
														focusedIndex
													}
													idPrefix={menuId}
													itemRefs={itemRefs}
													onFocused={setFocusedIndex}
													onActivate={() => {
														if (!item.keepOpen)
															close(false);
														item.onSelect();
													}}
													onMove={moveFocus}
												/>
											);
										})}
									</div>
								))}
							</div>
						)}
					</div>
				)}
			</div>
		</div>
	);
}

function MenuItemButton({
	item,
	index,
	focused,
	idPrefix,
	itemRefs,
	onFocused,
	onActivate,
	onMove,
}: {
	item: DocumentMenuItem;
	index: number;
	focused: boolean;
	idPrefix: string;
	itemRefs: React.RefObject<(HTMLButtonElement | null)[]>;
	onFocused: (index: number) => void;
	onActivate: () => void;
	onMove: (from: number, key: string) => boolean;
}) {
	const showReason = Boolean(item.disabled && item.disabledReason);
	const reasonId = `${idPrefix}-reason-${item.id}`;

	return (
		<button
			ref={(el) => {
				itemRefs.current[index] = el;
			}}
			type="button"
			role="menuitem"
			tabIndex={focused ? 0 : -1}
			aria-disabled={item.disabled || undefined}
			// The reason is a DESCRIPTION, not part of the name. The reason node
			// lives inside the button (so it is visible under the label), which
			// means name computation would otherwise fold it in and a screen
			// reader would read "Edit Quote A job was created from this quote…"
			// as one run-on label. aria-label pins the name to the label alone —
			// and it matches the visible label text, so Label in Name (2.5.3)
			// still holds — while aria-describedby carries the explanation.
			// `title` is gone with them: it repeated the same string a second
			// time, and hover was never the point.
			aria-label={showReason ? item.label : undefined}
			aria-describedby={showReason ? reasonId : undefined}
			onFocus={() => onFocused(index)}
			onClick={() => {
				if (item.disabled) return;
				onActivate();
			}}
			onKeyDown={(e) => {
				if (onMove(index, e.key)) e.preventDefault();
			}}
			className={`flex w-full items-start gap-2 px-4 py-2 text-left text-sm transition-colors duration-150 ease-out ${
				item.disabled
					? "cursor-not-allowed"
					: `hover:bg-surface ${INTENT_TEXT[item.intent ?? "neutral"]}`
			}`}
		>
			{/* The icon column is reserved even when an item has none: the
			    Lifecycle group's items come from LifecycleAction, which carries
			    no icon, and without the spacer their labels started 22px left
			    of the Document group's inside the same menu. */}
			<span
				className={`flex h-5 w-4 flex-shrink-0 items-center justify-center ${
					item.disabled ? "opacity-40" : ""
				}`}
			>
				{item.icon}
			</span>
			<span className="min-w-0 flex-1">
				{/* Disabled state is carried by dimmed chrome and muted text
				    tokens, NOT by opacity on the text. `opacity-40` over
				    text-text-muted put the reason at ~1.7:1 in the light
				    theme — unreadable, which defeats the entire point of
				    showing it. These tokens are contrast-tuned per theme. */}
				<span
					className={`block ${
						item.disabled ? "text-text-tertiary" : ""
					}`}
				>
					{item.label}
				</span>
				{showReason && (
					<span
						id={reasonId}
						className="mt-0.5 block text-[11px] font-normal leading-snug text-text-muted"
					>
						{item.disabledReason}
					</span>
				)}
			</span>
		</button>
	);
}
