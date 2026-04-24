import { api } from "./axiosClient";
import type { ApiResponse } from "../types/api";

export const presignKeys = async (keys: string[]): Promise<Record<string, string>> => {
	const response = await api.post<ApiResponse<Record<string, string>>>("/presign", { keys });
	if (!response.data.success) {
		throw new Error(response.data.error?.message || "Failed to generate presigned URLs");
	}
	return response.data.data!;
};
