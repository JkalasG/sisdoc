import { http, httpWithStatus, json } from '@/shared/api/http';
import type { CurrentUser, LoginResponse } from '@/shared/api/types';

export const authApi = {
  /** 200 = sesión iniciada · 202 = dispositivo pendiente de autorización. */
  login: (email: string, password: string) =>
    httpWithStatus<LoginResponse>('/auth/login', { method: 'POST', ...json({ email, password }) }),
  me: () => http<CurrentUser>('/auth/me'),
  logout: () => http<void>('/auth/logout', { method: 'POST' }),
  logoutAll: () => http<void>('/auth/logout-all', { method: 'POST' }),
  changePassword: (currentPassword: string, newPassword: string) =>
    http<void>('/auth/change-password', { method: 'POST', ...json({ currentPassword, newPassword }) }),
};
