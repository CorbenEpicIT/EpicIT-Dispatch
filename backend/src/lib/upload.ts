import multer from "multer";

export const imageUpload = multer({
	storage: multer.memoryStorage(),
	limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
	fileFilter: (_req, file, cb) => {
		const allowed = ["image/jpeg", "image/png", "image/webp"];
		if (allowed.includes(file.mimetype)) {
			cb(null, true);
		} else {
			cb(new Error("Only JPEG, PNG, and WebP images are allowed"));
		}
	},
});

const SPREADSHEET_MIMES = [
	"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", // xlsx
	"application/vnd.ms-excel", // xls
	"text/csv",
	"application/csv",
];

export const spreadsheetUpload = multer({
	storage: multer.memoryStorage(),
	limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
	fileFilter: (_req, file, cb) => {
		const ext = file.originalname.split(".").pop()?.toLowerCase();
		if (SPREADSHEET_MIMES.includes(file.mimetype) || ["xlsx", "xls", "csv"].includes(ext ?? "")) {
			cb(null, true);
		} else {
			cb(new Error("Only .xlsx, .xls, and .csv files are allowed"));
		}
	},
});
