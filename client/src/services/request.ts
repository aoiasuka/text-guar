import axios, { type AxiosRequestConfig } from 'axios';
import { message } from 'antd';
import { useAuthStore } from '@/stores/useAuthStore.js';

const http = axios.create({
  baseURL: '/api',
  timeout: 10000,
});

http.interceptors.request.use((config) => {
  const token = useAuthStore.getState().token;
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

http.interceptors.response.use(
  (response) => response.data.data,
  (error) => {
    const status = error.response?.status;
    const text = error.response?.data?.message || error.message || '请求失败';
    if (status === 401) {
      useAuthStore.getState().logout();
      window.location.href = '/login';
    } else {
      message.error(text);
    }
    return Promise.reject(error);
  },
);

const request = {
  get: <T>(url: string, config?: AxiosRequestConfig) => http.get<unknown, T>(url, config),
  post: <T>(url: string, data?: unknown, config?: AxiosRequestConfig) =>
    http.post<unknown, T>(url, data, config),
  put: <T>(url: string, data?: unknown, config?: AxiosRequestConfig) =>
    http.put<unknown, T>(url, data, config),
  patch: <T>(url: string, data?: unknown, config?: AxiosRequestConfig) =>
    http.patch<unknown, T>(url, data, config),
  delete: <T>(url: string, config?: AxiosRequestConfig) => http.delete<unknown, T>(url, config),
};

export default request;
