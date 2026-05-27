/*
 *	File Created by Max, 3/5/26
 *	Centralizing api variable so headers stay consistent
 */

import axios from "axios";
import { useAuthStore } from "../auth/authStore";
const BASE_URL: string = import.meta.env.VITE_BACKEND_URL;
const refreshClient = axios.create({
	baseURL: BASE_URL,
	withCredentials: true,
});
let isRefreshing = false;
let failedQueue: { resolve: (token: string) => void; reject: (error?: any) => void }[] = [];
const processQueue = (error: any, token: string | null = null) => {
	failedQueue.forEach((p) => (token ? p.resolve(token) : p.reject(error)));
	failedQueue = [];
};
if (!BASE_URL) {
	console.warn("Failed to load backend url environment variable!");
}
export const api = axios.create({
	baseURL: BASE_URL,
	withCredentials: true,
});
api.interceptors.request.use((config) => {
	const token = localStorage.getItem("accessToken");
	if (token) {
		config.headers.Authorization = `Bearer ${token}`;
	}
	return config;
});

api.interceptors.response.use((response) => response, async (error) => {
	const originalRequest = error.config;
	if (error.response?.status !== 401 || originalRequest._retry) {
		return Promise.reject(error);
	}
	if (isRefreshing) {
		return new Promise((resolve, reject) => {
			failedQueue.push({ 
				resolve: (token) => {
					originalRequest.headers.Authorization = `Bearer ${token}`;
					resolve(api(originalRequest));
				}, reject });
		});
	}
	originalRequest._retry = true;
	isRefreshing = true;
	try {
		const response = await refreshClient.post<{ data: {token: string} }>("/refresh-token");
		if (!response.data?.data?.token) {
			isRefreshing = false;
			throw new Error("No token in refresh response");
		}
		const newToken = response.data.data.token;
		localStorage.setItem("accessToken", newToken);
		api.defaults.headers.common.Authorization = `Bearer ${newToken}`;
		try {
			const parts = newToken.split(".");
			if (parts.length === 3) {
				const payload = JSON.parse(atob(parts[1]));
				const { user, login } = useAuthStore.getState();
				if (user) {
					login(
						payload.role,
						user.name,
						payload.uid,
						payload.organization_id ?? null,
						payload.organization_timezone ?? user.orgTimezone,
						payload.permissions ?? []
					);
				}
			}
		} catch { /* ignore errors, token still updated in localStorage */ }
		processQueue(null, newToken);
		originalRequest.headers.Authorization = `Bearer ${newToken}`;
		isRefreshing = false;
		return api(originalRequest);
	}catch (err) {
		processQueue(err, null);
		localStorage.removeItem("accessToken");
		delete api.defaults.headers.common["Authorization"];
		window.location.href = "/login";
		isRefreshing = false;
		return Promise.reject(err);
	}
});