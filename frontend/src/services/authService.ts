import api from './api';
import type { LoginRequest, LoginResponse, RegisterRequest, User } from '@/types';

const unwrap = <T = any>(payload: any): T => (payload?.data ?? payload) as T;

export const authService = {
  login: async (credentials: LoginRequest): Promise<LoginResponse> => {
    const data = await api.post<LoginResponse>('/auth/login', {
      identifier: credentials.identifier,
      password: credentials.password,
    });
    return unwrap(data);
  },

  register: async (payload: RegisterRequest): Promise<User> => {
    const data = await api.post<User>('/auth/register', payload);
    return data;
  },

  getMe: async (): Promise<User> => {
    const data = await api.get<User>('/auth/me');
    return unwrap(data);
  },

  refreshToken: async (refreshToken: string): Promise<LoginResponse> => {
    const data = await api.post<LoginResponse>('/auth/refresh', { refresh_token: refreshToken });
    return unwrap(data);
  },

  changePassword: async (currentPassword: string, newPassword: string): Promise<void> => {
    await api.post('/auth/change-password', {
      current_password: currentPassword,
      new_password: newPassword,
    });
  },

  forgotPassword: async (email: string): Promise<void> => {
    await api.post('/auth/forgot-password', { email });
  },

  resetPassword: async (token: string, newPassword: string): Promise<void> => {
    await api.post('/auth/reset-password', { token, new_password: newPassword });
  },

  logout: async (): Promise<void> => {
    const refreshToken = localStorage.getItem('refresh_token');
    try {
      await api.post('/auth/logout', refreshToken ? { refresh_token: refreshToken } : {});
    } catch { /* ignore */ }
    sessionStorage.removeItem('access_token');
    sessionStorage.removeItem('portal_token');
    sessionStorage.removeItem('portal_role');
    sessionStorage.removeItem('portal_name');
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
  },

  sendOtp: async (
    credential: { phone?: string; identifier?: string; channel?: string },
    password: string,
  ): Promise<{ session_id: string; phone_masked?: string; email_masked?: string; delivery?: string }> => {
    const data = await api.post<{ session_id: string; phone_masked?: string; email_masked?: string; delivery?: string }>(
      '/auth/send-otp',
      { ...credential, password, channel: credential.channel ?? 'sms' },
    );
    return unwrap(data);
  },

  verifyOtp: async (session_id: string, otp: string): Promise<LoginResponse> => {
    const data = await api.post<LoginResponse>('/auth/verify-otp', { session_id, otp });
    return unwrap(data);
  },
};
