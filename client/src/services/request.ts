import axios, { AxiosError, type AxiosRequestConfig } from 'axios';
import { message } from 'antd';
import { useAuthStore } from '@/stores/useAuthStore.js';

const http = axios.create({
  baseURL: '/api',
  timeout: 15000,
});

let isRedirecting = false;
let lastErrorText = '';
let lastErrorAt = 0;

function showError(text: string) {
  const now = Date.now();
  if (text === lastErrorText && now - lastErrorAt < 1500) return;
  lastErrorText = text;
  lastErrorAt = now;
  message.error(text);
}

function redirectToLogin() {
  if (isRedirecting) return;
  isRedirecting = true;
  useAuthStore.getState().logout();
  const current = window.location.pathname + window.location.search;
  const target = current && current !== '/login' ? `/login?redirect=${encodeURIComponent(current)}` : '/login';
  window.location.replace(target);
}

http.interceptors.request.use((config) => {
  const token = useAuthStore.getState().token;
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

http.interceptors.response.use(
  (response) => response.data?.data,
  (error: AxiosError<{ message?: string }>) => {
    if (axios.isCancel(error)) return Promise.reject(error);

    const status = error.response?.status;
    const text = error.response?.data?.message || error.message || '请求失败';

    if (status === 401) {
      redirectToLogin();
      return Promise.reject(error);
    }
    if (status === 403) {
      showError(text || '权限不足');
    } else if (status === 429) {
      showError(text || '请求过于频繁，请稍后再试');
    } else if (!error.response) {
      showError('网络异常，请检查连接');
    } else if (status && status >= 500) {
      showError('服务器繁忙，请稍后再试');
    } else {
      showError(text);
    }
    return Promise.reject(error);
  },
);

function unwrap<T>(promise: Promise<unknown>) {
  return promise as Promise<T>;
}

const request = {
  get: <T>(url: string, config?: AxiosRequestConfig) => unwrap<T>(http.get(url, config)),
  post: <T>(url: string, data?: unknown, config?: AxiosRequestConfig) =>
    unwrap<T>(http.post(url, data, config)),
  put: <T>(url: string, data?: unknown, config?: AxiosRequestConfig) =>
    unwrap<T>(http.put(url, data, config)),
  patch: <T>(url: string, data?: unknown, config?: AxiosRequestConfig) =>
    unwrap<T>(http.patch(url, data, config)),
  delete: <T>(url: string, config?: AxiosRequestConfig) => unwrap<T>(http.delete(url, config)),
};

export default request;
