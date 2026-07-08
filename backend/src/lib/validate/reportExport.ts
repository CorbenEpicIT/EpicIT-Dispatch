import { z } from "zod";

const exportColumnSchema = z.object({
	key: z.string().min(1),
	label: z.string(),
});

export const exportReportSchema = z.object({
	filename: z.string().trim().min(1, "Filename is required").max(200),
	sheetName: z.string().trim().min(1).max(31).optional(),
	columns: z.array(exportColumnSchema).min(1, "At least one column is required"),
	rows: z.array(z.record(z.string(), z.unknown())),
});

export type ExportColumnInput = z.infer<typeof exportColumnSchema>;
export type ExportReportInput = z.infer<typeof exportReportSchema>;
