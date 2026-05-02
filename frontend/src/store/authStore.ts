import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { User, RoleType } from '@/types';
import { authService } from '@/services/authService';

interface AuthState {
  token: string | null;
  user: User | null;
  permissions: string[];
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;

  setAuth: (token: string, user: User, permissions: string[]) => void;
  clearAuth: () => void;

  login: (email: string, password: string) => Promise<void>;
  register: (payload: { email: string; password: string; full_name: string; phone: string; role: RoleType }) => Promise<void>;
  logout: () => Promise<void>;
  fetchUser: () => Promise<void>;
  clearError: () => void;

  // Permission helpers
  hasPermission: (permission: string) => boolean;
  hasAnyPermission: (permissions: string[]) => boolean;
  hasRole: (role: RoleType) => boolean;
  hasAnyRole: (roles: RoleType[]) => boolean;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      token: null,
      user: null,
      permissions: [],
      isAuthenticated: false,
      isLoading: false,
      error: null,

      setAuth: (token: string, user: User, permissions: string[]) => {
        localStorage.setItem('access_token', token);
        set({ token, user, permissions, isAuthenticated: true });
      },

      clearAuth: () => {
        localStorage.removeItem('access_token');
        localStorage.removeItem('refresh_token');
        set({ token: null, user: null, permissions: [], isAuthenticated: false, error: null });
      },

      login: async (email: string, password: string) => {
        set({ isLoading: true, error: null });
        try {
          // Clear any stale tokens before login to avoid race conditions
          localStorage.removeItem('access_token');
          localStorage.removeItem('refresh_token');
          const response = await authService.login({ identifier: email.trim(), password });
          localStorage.setItem('access_token', response.access_token);
          localStorage.setItem('refresh_token', response.refresh_token);
          const permissions = response.user.permissions || [];
          set({
            token: response.access_token,
            user: response.user,
            permissions,
            isAuthenticated: true,
            isLoading: false,
          });
        } catch (error: any) {
          const detail = error.response?.data?.detail;
          let message = 'Login failed. Check your credentials.';
          if (typeof detail === 'string') {
            message = detail;
          } else if (Array.isArray(detail)) {
            message = detail.map((d: any) => d.msg || String(d)).join('; ');
          }
          set({ error: message, isLoading: false });
          throw error;
        }
      },

      register: async (payload) => {
        set({ isLoading: true, error: null });
        try {
          await authService.register(payload);
          set({ isLoading: false });
        } catch (error: any) {
          const detail = error.response?.data?.detail;
          let message = 'Registration failed.';
          if (typeof detail === 'string') {
            message = detail;
          } else if (Array.isArray(detail)) {
            message = detail.map((d: any) => d.msg || String(d)).join('; ');
          }
          set({ error: message, isLoading: false });
          throw error;
        }
      },

      logout: async () => {
        try { await authService.logout(); } catch { /* ignore */ }
        get().clearAuth();
      },

      fetchUser: async () => {
        const token = get().token ?? localStorage.getItem('access_token');
        if (!token) {
          set({ token: null, isAuthenticated: false, user: null, permissions: [], isLoading: false });
          return;
        }
        if (!get().token) {
          set({ token });
        }
        set({ isLoading: true });
        try {
          // First, silently refresh the access token so roles/permissions are always current
          const refreshToken = localStorage.getItem('refresh_token');
          if (refreshToken) {
            try {
              const { default: axios } = await import('axios');
              const API_BASE_URL = (import.meta as any).env?.VITE_API_URL || '/api/v1';
              const refreshRes = await axios.post(`${API_BASE_URL}/auth/refresh`, { refresh_token: refreshToken });
              const newToken = refreshRes.data?.data?.access_token ?? refreshRes.data?.access_token;
              const newRefresh = refreshRes.data?.data?.refresh_token ?? refreshRes.data?.refresh_token;
              if (newToken) {
                localStorage.setItem('access_token', newToken);
                set({ token: newToken });
              }
              if (newRefresh) {
                localStorage.setItem('refresh_token', newRefresh);
              }
            } catch { /* ignore — will still try getMe with existing token */ }
          }

          const user = await authService.getMe();
          set({ user, permissions: user.permissions || [], isAuthenticated: true, isLoading: false });
        } catch {
          // Only clear tokens if a concurrent login hasn't stored new ones
          const currentToken = localStorage.getItem('access_token');
          if (!currentToken || currentToken === token) {
            get().clearAuth();
            set({ isLoading: false });
            if (window.location.pathname !== '/login') {
              window.location.href = '/login';
            }
          } else {
            // A concurrent login stored a new token — don't clear it
            set({ isLoading: false });
          }
        }
      },

      clearError: () => set({ error: null }),

      hasPermission: (permission: string) => {
        const { user } = get();
        if (!user) return false;
        // roles is string array like ["admin"]
        if ((user.roles ?? []).map(r => r.toLowerCase()).includes('admin') || (user.permissions ?? []).includes('*')) return true;
        return (user.permissions ?? []).includes(permission);
      },

      hasAnyPermission: (permissions: string[]) => {
        const { user } = get();
        if (!user) return false;
        if ((user.roles ?? []).map(r => r.toLowerCase()).includes('admin') || (user.permissions ?? []).includes('*')) return true;
        return permissions.some(p => (user.permissions ?? []).includes(p));
      },

      hasRole: (role: RoleType) => {
        const { user } = get();
        if (!user) return false;
        return (user.roles ?? []).includes(role);
      },

      hasAnyRole: (roles: RoleType[]) => {
        const { user } = get();
        if (!user) return false;
        return roles.some(role => (user.roles ?? []).includes(role));
      },
    }),
    {
      name: 'auth-storage',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        token: state.token,
        user: state.user,
        permissions: state.permissions,
        isAuthenticated: state.isAuthenticated,
      }),
    }
  )
);
