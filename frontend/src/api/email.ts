import { api } from "./axiosClient";
import type { ApiResponse } from "../types/api";


// ============================================================================
// EMAIL API
// ============================================================================

export const verifyEmail = async (token: string): Promise<{ message: string }> => {
    const response = await api.post<ApiResponse<{ message: string }>>('/verify-email', { token });
    if (!response.data.data){
        throw new Error(response.data.error?.message || "Email verification failed");
    }
    return response.data.data;
};