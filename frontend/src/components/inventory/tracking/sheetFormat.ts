// Date formatter shared by the field-side tracking sheets (SerialSheet, LotSheet).
// Lives apart from the shared components so sheetShared.tsx only exports
// components (keeps React fast-refresh working for it).

export function formatDate(iso: string): string {
	return new Date(iso).toLocaleDateString(undefined, {
		month: "short",
		day: "numeric",
		year: "numeric",
	});
}
