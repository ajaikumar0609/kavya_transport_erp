import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';
import toast from 'react-hot-toast';
import { useAuthStore } from '@/store/authStore';

// Our response interceptor unwraps response.data, so all calls return the inner data directly.
// Override AxiosInstance methods to reflect this.
declare module 'axios' {
  interface AxiosInstance {
    get<T = any>(url: string, config?: any): Promise<T>;
    post<T = any>(url: string, data?: any, config?: any): Promise<T>;
    put<T = any>(url: string, data?: any, config?: any): Promise<T>;
    patch<T = any>(url: string, data?: any, config?: any): Promise<T>;
    delete<T = any>(url: string, config?: any): Promise<T>;
  }
}

const API_BASE_URL = import.meta.env.DEV ? '/api/v1' : (import.meta.env.VITE_API_URL || '/api/v1');

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor - attach token
api.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    const token = useAuthStore.getState().token ?? sessionStorage.getItem('access_token') ?? localStorage.getItem('access_token');
    if (token && config.headers) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor - handle 401 refresh
let isRefreshing = false;
let failedQueue: Array<{
  resolve: (value?: unknown) => void;
  reject: (reason?: unknown) => void;
}> = [];

const processQueue = (error: AxiosError | null, token: string | null = null) => {
  failedQueue.forEach((prom) => {
    if (error) {
      prom.reject(error);
    } else {
      prom.resolve(token);
    }
  });
  failedQueue = [];
};

const getApiErrorMessage = (error: AxiosError): string => {
  const responseData: any = error.response?.data;
  const detail = responseData?.detail;

  if (typeof responseData?.message === 'string' && responseData.message.trim()) {
    return responseData.message;
  }

  if (typeof detail === 'string' && detail.trim()) {
    return detail;
  }

  if (Array.isArray(detail)) {
    const joined = detail
      .map((item: any) => {
        if (typeof item === 'string') return item;
        if (typeof item?.msg === 'string') return item.msg;
        return '';
      })
      .filter(Boolean)
      .join('; ');
    if (joined) return joined;
  }

  if (detail && typeof detail === 'object' && typeof detail.msg === 'string') {
    return detail.msg;
  }

  return error.message || 'Request failed';
};

const clearAuthAndRedirectToLogin = () => {
  useAuthStore.getState().clearAuth();
  sessionStorage.removeItem('access_token');
  sessionStorage.removeItem('portal_token');
  sessionStorage.removeItem('portal_role');
  sessionStorage.removeItem('portal_name');
  localStorage.removeItem('access_token');
  localStorage.removeItem('refresh_token');
  if (window.location.pathname !== '/login') {
    window.location.href = '/login';
  }
};

api.interceptors.response.use(
  (response) => response.data ?? response,
  async (error: AxiosError) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & { _retry?: boolean };
    const suppressErrorToast = Boolean((error.config as any)?.suppressErrorToast);

    // Don't attempt token refresh for auth endpoints (login, register, refresh)
    const isAuthRequest = originalRequest.url?.includes('/auth/login') ||
      originalRequest.url?.includes('/auth/register') ||
      originalRequest.url?.includes('/auth/refresh');

    if (error.response?.status === 401 && !originalRequest._retry && !isAuthRequest) {
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        }).then((token) => {
          if (originalRequest.headers) {
            originalRequest.headers.Authorization = `Bearer ${token}`;
          }
          return api(originalRequest);
        });
      }

      originalRequest._retry = true;
      isRefreshing = true;

      const refreshToken = localStorage.getItem('refresh_token');
      if (!refreshToken) {
        clearAuthAndRedirectToLogin();
        return Promise.reject(error);
      }

      try {
        const { data } = await axios.post(`${API_BASE_URL}/auth/refresh`, {
          refresh_token: refreshToken,
        });
        // Backend returns { success, data: { access_token, ... }, message }
        const newToken = data.data?.access_token || data.access_token;
        sessionStorage.setItem('access_token', newToken);
        const newRefresh = data.data?.refresh_token || data.refresh_token;
        if (newRefresh) {
          localStorage.setItem('refresh_token', newRefresh);
        }
        useAuthStore.setState({ token: newToken });
        processQueue(null, newToken);
        if (originalRequest.headers) {
          originalRequest.headers.Authorization = `Bearer ${newToken}`;
        }
        return api(originalRequest);
      } catch (refreshError) {
        processQueue(refreshError as AxiosError, null);
        clearAuthAndRedirectToLogin();
        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
      }
    }

    if (error.response?.status === 401 && !isAuthRequest) {
      if (suppressErrorToast) {
        return Promise.reject(error);
      }
      toast.error('Session expired. Please log in again.');
      clearAuthAndRedirectToLogin();
      return Promise.reject(error);
    }

    if (!error.response) {
      if (suppressErrorToast) {
        return Promise.reject(error);
      }
      if (error.code === 'ECONNABORTED') {
        toast.error('Request timed out. The server is taking too long — please try again.');
      } else {
        toast.error('Network error. Please check your internet connection.');
      }
      return Promise.reject(error);
    }

    if (suppressErrorToast) {
      return Promise.reject(error);
    }

    const status = error.response.status;
    if (status === 403) {
      toast.error('Permission denied. You do not have access to this action.');
    } else if (status === 404) {
      toast.error('Requested resource was not found.');
    } else if (status >= 500) {
      toast.error('Server error. Please try again shortly.');
    } else if (status >= 400) {
      toast.error(getApiErrorMessage(error));
    }

    return Promise.reject(error);
  }
);

export default api;
