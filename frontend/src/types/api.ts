export interface ApiResponse<T> {
	success: boolean;
	data: T | null;
	error: {
		code: string;
		message: string;
	} | null;
	meta?: {
		timestamp: string;
		count?: number;
		// Server-side row cap was hit: `data` is a prefix of the real result set,
		// not the whole thing. Mirrors ResponseMeta.hasMore on the backend.
		hasMore?: boolean;
	};
}