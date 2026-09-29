// Navigation on the technician page is a bordered button, never bare link text —
// the same secondary idiom as ClientDetailsCard / InventoryPage, so a dispatcher
// reads "this goes somewhere" the same way everywhere in the app.
export const NAV_BUTTON =
	"inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm font-medium text-text-secondary transition-colors duration-150 ease-out hover:border-border-strong hover:bg-surface-raised hover:text-text-primary";

// Card-header and in-tile size.
export const NAV_BUTTON_SM =
	"inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1 text-xs font-medium text-text-secondary transition-colors duration-150 ease-out hover:border-border-strong hover:bg-surface-raised hover:text-text-primary";
