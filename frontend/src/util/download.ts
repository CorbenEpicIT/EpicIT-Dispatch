export const triggerDownload = (blob: Blob, filename: string) => {
	const url = URL.createObjectURL(blob);
	const a = document.createElement("a");
	a.href = url;
	a.download = filename;
	a.click();
	setTimeout(() => URL.revokeObjectURL(url), 1000);
};

export const datedFilename = (base: string): string => {
	const dateStr = new Date()
		.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })
		.replace(",", "");
	return `${base} ${dateStr}.xlsx`;
};
