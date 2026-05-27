import { useState, useRef, useCallback } from "react";
import { X, Upload, Download, FileSpreadsheet, CheckCircle, AlertCircle } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import {
	importInventory,
	downloadInventoryTemplate,
	exportLowStockInventory,
	type ImportResult,
} from "../../api/inventory";

const ACCEPTED_EXTS = [".xlsx", ".xls", ".csv"];
const ACCEPTED_MIMES = [
	"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
	"application/vnd.ms-excel",
	"text/csv",
	"application/csv",
];

function isValidFile(file: File) {
	const ext = "." + (file.name.split(".").pop()?.toLowerCase() ?? "");
	return ACCEPTED_EXTS.includes(ext) || ACCEPTED_MIMES.includes(file.type);
}

interface Props {
	isOpen: boolean;
	onClose: () => void;
}

export default function InventoryImportExport({ isOpen, onClose }: Props) {
	const [isDragging, setIsDragging] = useState(false);
	const [selectedFile, setSelectedFile] = useState<File | null>(null);
	const [isImporting, setIsImporting] = useState(false);
	const [importResult, setImportResult] = useState<ImportResult | null>(null);
	const [importError, setImportError] = useState<string | null>(null);
	const [isExporting, setIsExporting] = useState(false);
	const [isDownloadingTemplate, setIsDownloadingTemplate] = useState(false);

	const fileInputRef = useRef<HTMLInputElement>(null);
	const queryClient = useQueryClient();

	const selectFile = (file: File) => {
		if (!isValidFile(file)) {
			setImportError("Invalid file type. Please upload .xlsx, .xls, or .csv");
			return;
		}
		setSelectedFile(file);
		setImportResult(null);
		setImportError(null);
	};

	const handleDrop = useCallback((e: React.DragEvent) => {
		e.preventDefault();
		setIsDragging(false);
		const file = e.dataTransfer.files[0];
		if (file) selectFile(file);
	}, []);

	const handleImport = async () => {
		if (!selectedFile) return;
		setIsImporting(true);
		setImportError(null);
		try {
			const result = await importInventory(selectedFile);
			setImportResult(result);
			queryClient.invalidateQueries({ queryKey: ["allInventory"] });
		} catch (e) {
			setImportError(e instanceof Error ? e.message : "Import failed");
		} finally {
			setIsImporting(false);
		}
	};

	const handleExport = async () => {
		setIsExporting(true);
		try {
			await exportLowStockInventory();
		} finally {
			setIsExporting(false);
		}
	};

	const handleDownloadTemplate = async () => {
		setIsDownloadingTemplate(true);
		try {
			await downloadInventoryTemplate();
		} finally {
			setIsDownloadingTemplate(false);
		}
	};

	const handleClose = () => {
		setSelectedFile(null);
		setImportResult(null);
		setImportError(null);
		onClose();
	};

	if (!isOpen) return null;

	return (
		<div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
			<div className="bg-zinc-900 border border-zinc-700 rounded-xl p-6 w-full max-w-md mx-4">
				{/* Header */}
				<div className="flex items-center justify-between mb-5">
					<div className="flex items-center gap-2">
						<FileSpreadsheet size={18} className="text-blue-400" />
						<h3 className="text-base font-semibold text-white">Import / Export</h3>
					</div>
					<button
						onClick={handleClose}
						className="text-zinc-500 hover:text-white transition-colors"
					>
						<X size={18} />
					</button>
				</div>

				{/* Import Section */}
				<div className="mb-5">
					<div className="flex items-center justify-between mb-3">
						<h4 className="text-sm font-medium text-zinc-300">Import Items</h4>
						<button
							onClick={handleDownloadTemplate}
							disabled={isDownloadingTemplate}
							className="flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 transition-colors disabled:opacity-50"
						>
							<Download size={11} />
							{isDownloadingTemplate ? "Downloading…" : "Download Template"}
						</button>
					</div>

					{/* Drop zone */}
					<div
						onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
						onDragLeave={() => setIsDragging(false)}
						onDrop={handleDrop}
						onClick={() => fileInputRef.current?.click()}
						className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors ${
							isDragging
								? "border-blue-500 bg-blue-500/10"
								: selectedFile
								? "border-zinc-600 bg-zinc-800/40"
								: "border-zinc-700 hover:border-zinc-500"
						}`}
					>
						<input
							ref={fileInputRef}
							type="file"
							accept=".xlsx,.xls,.csv"
							className="hidden"
							onChange={(e) => {
								const file = e.target.files?.[0];
								if (file) selectFile(file);
								e.target.value = "";
							}}
						/>
						{selectedFile ? (
							<div className="flex items-center justify-center gap-2">
								<FileSpreadsheet size={18} className="text-green-400 shrink-0" />
								<span className="text-sm text-white truncate max-w-[220px]">
									{selectedFile.name}
								</span>
								<button
									onClick={(e) => {
										e.stopPropagation();
										setSelectedFile(null);
										setImportResult(null);
										setImportError(null);
									}}
									className="text-zinc-500 hover:text-white ml-1 shrink-0"
								>
									<X size={14} />
								</button>
							</div>
						) : (
							<>
								<Upload size={22} className="mx-auto text-zinc-500 mb-2" />
								<p className="text-sm text-zinc-400">
									Drop a file here or{" "}
									<span className="text-blue-400">browse</span>
								</p>
								<p className="text-xs text-zinc-600 mt-1">.xlsx, .xls, .csv</p>
							</>
						)}
					</div>

					{importError && (
						<div className="mt-2 flex items-center gap-1.5 text-xs text-red-400">
							<AlertCircle size={13} />
							{importError}
						</div>
					)}

					{importResult && (
						<div className="mt-3 rounded-lg bg-zinc-800 border border-zinc-700 p-3 space-y-2">
							<div className="flex items-center gap-1.5 text-sm text-green-400">
								<CheckCircle size={14} />
								{importResult.imported} item
								{importResult.imported !== 1 ? "s" : ""} imported successfully
							</div>
							{importResult.skipped.length > 0 && (
								<div className="space-y-1 max-h-28 overflow-y-auto">
									<p className="text-xs text-yellow-500">
										{importResult.skipped.length} row
										{importResult.skipped.length !== 1 ? "s" : ""} skipped:
									</p>
									{importResult.skipped.map((s) => (
										<p key={s.row} className="text-xs text-zinc-400">
											Row {s.row}: {s.reason}
										</p>
									))}
								</div>
							)}
						</div>
					)}

					<button
						onClick={handleImport}
						disabled={!selectedFile || isImporting || !!importResult}
						className="mt-3 w-full h-9 rounded-md bg-blue-600 hover:bg-blue-500 text-sm font-medium text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
					>
						{isImporting ? "Importing…" : importResult ? "Done" : "Import Items"}
					</button>
				</div>

				{/* Divider */}
				<div className="border-t border-zinc-700 mb-5" />

				{/* Export Section */}
				<div>
					<h4 className="text-sm font-medium text-zinc-300 mb-3">Export</h4>
					<button
						onClick={handleExport}
						disabled={isExporting}
						className="w-full h-9 flex items-center justify-center gap-2 rounded-md border border-zinc-700 hover:bg-zinc-800 text-sm text-zinc-300 transition-colors disabled:opacity-50"
					>
						<Download size={14} />
						{isExporting ? "Exporting…" : "Export Low Stock List"}
					</button>
				</div>
			</div>
		</div>
	);
}
