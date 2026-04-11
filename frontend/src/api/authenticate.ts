import { api } from "./axiosClient";
import type { ApiResponse } from "../types/api";

// ============================================================================
// AUTHENTICATE API
// ============================================================================

// temporary will add actual type when I get it figured out
interface User{
    email: string,
    password: string,
    role: string
}

interface AuthResponse {
    pendingToken: string;
    token: string,
    expiresIn: number,
    refreshToken?: string,
    user?: {
        email: string,
        role: string
    },
    forcePasswordReset?: boolean,
    resetToken?: string,
}

export const loginCall = async (input: User): Promise<AuthResponse> => {
    // Ensure coords is always provided (backend requirement)
    const userData = { 
        ...input,
    }
    
    const response = await api.post<ApiResponse<AuthResponse>>('/login', userData);

    if (response.data.error) {
        throw new Error(response.data.error?.message || "Login failed");
    }
    const data = response.data.data!;
    
    // Store the token and set it as default header for all future requests
    localStorage.setItem("accessToken", data.pendingToken);
    api.defaults.headers.common["Authorization"] = `Bearer ${data.pendingToken}`;
    console.log(localStorage.getItem("accessToken"));
    console.log("api headers", api.defaults.headers.common["Authorization"]);
    
    console.log("response.data.data:", response.data.data);
    return response.data.data!;
};

export const verifyOTPCall = async (otp: string): Promise<AuthResponse> => {
    const response = await api.post<ApiResponse<AuthResponse>>('/otp-verify', { otp });

    if (response.data.error) {
        throw new Error(response.data.error?.message || "OTP verification failed");
    }
    console.log("OTP verification response:", response.data);
    localStorage.setItem("accessToken", response.data.data!.token);
    api.defaults.headers.common["Authorization"] = `Bearer ${response.data.data!.token}`;
    console.log("OTP verification successful, access token stored.");
    return response.data.data!;
}

export const logoutCall = async (): Promise<AuthResponse> => {
    const response = await api.post<ApiResponse<AuthResponse>>('/logout');

    if (response.data.error) {
        throw new Error(response.data.error?.message || "Logout Failed");
    }
    localStorage.removeItem("accessToken");
    delete api.defaults.headers.common.Authorization;
    return response.data.data!;
}

export const requestPasswordResetCall = async (id: string, role: string): Promise<{ message: string }> => {
    const endpoint = role === "technician" ? `/technicians/${id}/reset-password` : `/dispatchers/${id}/reset-password`;
    const response = await api.post<ApiResponse<{ message: string }>>(endpoint);

    if (response.data.error) {
        throw new Error(response.data.error?.message || "Password reset request failed");
    }
    return response.data.data!;
}

export const resetPasswordCall = async (token: string, newPassword: string, role: string): Promise<{ message: string }> => {
    const response = await api.post<ApiResponse<{ message: string }>>('/reset-password', { token, newPassword, role });   

    if (response.data.error) {
        throw new Error(response.data.error?.message || "Password reset failed");
    }
    return response.data.data!;
}