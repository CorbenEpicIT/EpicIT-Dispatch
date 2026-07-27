export interface ApiResponse<T = unknown> {
	success: boolean;
	data: T | null;
	error: ErrorDetails | null;
	meta?: ResponseMeta;
}

export interface ErrorDetails {
	code: string;
	message: string;
	details?: unknown;
	field?: string;
}

//Optional metadata for responses
export interface ResponseMeta {
	timestamp?: string;
	count?: number;
	hasMore?: boolean;
	page?: number;
	pageSize?: number;
}

export interface ControllerResult<T = unknown> {
	err: string;
	item?: T | null;
	message?: string;
}

export const ErrorCodes = {
	VALIDATION_ERROR: 'VALIDATION_ERROR',
	NOT_FOUND: 'NOT_FOUND',
	CONFLICT: 'CONFLICT',
	INVALID_INPUT: 'INVALID_INPUT',
	DELETE_ERROR: 'DELETE_ERROR',
	SERVER_ERROR: 'SERVER_ERROR',
	INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
	INVALID_TOKEN: 'INVALID_TOKEN',
	TOO_MANY_REQUESTS: 'TOO_MANY_REQUESTS',
	FORBIDDEN: 'FORBIDDEN',
	BAD_REQUEST: 'BAD_REQUEST',
} as const;

export type ErrorCode = typeof ErrorCodes[keyof typeof ErrorCodes];

export const createSuccessResponse = <T>(
	data: T,
	meta?: Partial<ResponseMeta>
): ApiResponse<T> => ({
	success: true,
	data,
	error: null,
	meta: {
		timestamp: new Date().toISOString(),
		...meta,
	},
});

export const createErrorResponse = (
	code: ErrorCode | string,
	message: string,
	details?: unknown,
	field?: string
): ApiResponse<null> => ({
	success: false,
	data: null,
	error: {
		code,
		message,
		details,
		field,
	},
	meta: {
		timestamp: new Date().toISOString(),
	},
});

// Error carrying an HTTP status + error code. The global errorHandler reads
// `statusCode` and `code` off the thrown error, so `throw httpError(...)`
// surfaces the right status instead of a blanket 500.
export interface HttpError extends Error {
	statusCode: number;
	code: ErrorCode | string;
}

export const httpError = (
	statusCode: number,
	code: ErrorCode | string,
	message: string,
): HttpError => {
	const err = new Error(message) as HttpError;
	err.statusCode = statusCode;
	err.code = code;
	return err;
};