import { http, httpWithStatus, json } from '@/shared/api/http';
import type { AuthConfig, CurrentUser, LoginResponse } from '@/shared/api/types';

export const authApi = {
  /** Opciones activas en el login (captcha, Google). Pública. */
  config: () => http<AuthConfig>('/auth/config'),
  /** 200 = sesión iniciada · 202 = dispositivo pendiente de autorización. `captchaToken` solo si el captcha está activo. */
  login: (email: string, password: string, captchaToken?: string) =>
    httpWithStatus<LoginResponse>('/auth/login', { method: 'POST', ...json({ email, password, ...(captchaToken ? { captchaToken } : {}) }) }),
  /** Acceso con Google: `idToken` es la credencial que entrega el botón de Google. Misma respuesta que `login`. */
  loginWithGoogle: (idToken: string) =>
    httpWithStatus<LoginResponse>('/auth/google', { method: 'POST', ...json({ idToken }) }),
  /** Pide un código de un solo uso por correo. Responde igual exista o no la cuenta. */
  requestPasswordReset: (email: string, captchaToken?: string) =>
    http<void>('/auth/password-reset/request', { method: 'POST', ...json({ email, ...(captchaToken ? { captchaToken } : {}) }) }),
  confirmPasswordReset: (email: string, code: string, newPassword: string) =>
    http<void>('/auth/password-reset/confirm', { method: 'POST', ...json({ email, code, newPassword }) }),
  me: () => http<CurrentUser>('/auth/me'),
  logout: () => http<void>('/auth/logout', { method: 'POST' }),
  logoutAll: () => http<void>('/auth/logout-all', { method: 'POST' }),
  changePassword: (currentPassword: string, newPassword: string) =>
    http<void>('/auth/change-password', { method: 'POST', ...json({ currentPassword, newPassword }) }),
};
