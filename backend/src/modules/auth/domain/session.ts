export type RevokeReason =
  | 'LOGOUT' | 'LOGOUT_ALL' | 'ROTATION_REUSE' | 'ADMIN'
  | 'PASSWORD_CHANGED' | 'DEVICE_BLOCKED' | 'USER_DISABLED' | 'EXPIRED';

export interface Session {
  id: string;
  userId: string;
  deviceId: string;
  refreshHash: string;
  prevRefreshHash: string | null;
  ip: string | null;
  userAgent: string | null;
  createdAt: Date;
  lastActivityAt: Date;
  absoluteExpiresAt: Date;
  revokedAt: Date | null;
  revokedReason: string | null;
}

export const SESSION_POLICY = {
  accessTtlSeconds: 15 * 60,
  inactivityMs: 30 * 60_000, // sin actividad 30 min → la sesión muere
  absoluteMs: 12 * 60 * 60_000, // 12 h máximo, aunque haya actividad
  maxLive: 3, // sesiones simultáneas por usuario; la 4ª se rechaza
  touchEveryMs: 60_000, // no se escribe actividad en BD más de 1 vez/minuto
} as const;

export function isSessionActive(s: Session, now: Date): boolean {
  if (s.revokedAt) return false;
  if (s.absoluteExpiresAt.getTime() <= now.getTime()) return false;
  return now.getTime() - s.lastActivityAt.getTime() < SESSION_POLICY.inactivityMs;
}

export const sessionExpiry = (now: Date): Date => new Date(now.getTime() + SESSION_POLICY.absoluteMs);

export const inactiveBefore = (now: Date): Date => new Date(now.getTime() - SESSION_POLICY.inactivityMs);

export const shouldTouch = (s: Session, now: Date): boolean =>
  now.getTime() - s.lastActivityAt.getTime() >= SESSION_POLICY.touchEveryMs;
