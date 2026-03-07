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
    token: string,
    expiresIn: number,
    refreshToken?: string,   // for refresh token rotation
    user?: {                 // avoids a second /me API call after login
        email: string,
        role: string
    }
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
    localStorage.setItem("accessToken", data.token);
    api.defaults.headers.common["Authorization"] = `Bearer ${data.token}`;
    console.log(localStorage.getItem("accessToken"));
    console.log("api headers", api.defaults.headers.common["Authorization"]);
    
    console.log("response.data.data:", response.data.data);
    return response.data.data!;
};