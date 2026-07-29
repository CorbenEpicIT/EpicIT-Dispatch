import * as XLSX from "xlsx";

export const rowsToXlsxBuffer = (
	rows: Record<string, unknown>[],
	colWidths: number[],
	sheetName: string,
): Buffer => {
	const ws = XLSX.utils.json_to_sheet(rows);
	if (colWidths.length) ws["!cols"] = colWidths.map((wch) => ({ wch }));
	const wb = XLSX.utils.book_new();
	XLSX.utils.book_append_sheet(wb, ws, sheetName);
	return Buffer.from(XLSX.write(wb, { type: "buffer", bookType: "xlsx" }));
};
