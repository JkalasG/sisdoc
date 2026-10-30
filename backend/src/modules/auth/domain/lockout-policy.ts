export const LOCKOUT = {
  maxAttempts: 5,
  minutesByLevel: [15, 30, 60], // progresivo; del tercer bloqueo en adelante se mantiene en 60
} as const;

export interface LoginState {
  failedAttempts: number;
  lockoutLevel: number;
  lockedUntil: Date | null;
}

export const isLocked = (u: { lockedUntil: Date | null }, now: Date): boolean =>
  u.lockedUntil !== null && u.lockedUntil.getTime() > now.getTime();

/** Calcula el nuevo estado tras un intento fallido. */
export function registerFailure(
  u: { failedAttempts: number; lockoutLevel: number },
  now: Date,
): LoginState {
  const attempts = u.failedAttempts + 1;
  if (attempts < LOCKOUT.maxAttempts) {
    return { failedAttempts: attempts, lockoutLevel: u.lockoutLevel, lockedUntil: null };
  }
  const idx = Math.min(u.lockoutLevel, LOCKOUT.minutesByLevel.length - 1);
  return {
    failedAttempts: 0,
    lockoutLevel: u.lockoutLevel + 1,
    lockedUntil: new Date(now.getTime() + LOCKOUT.minutesByLevel[idx] * 60_000),
  };
}

export const clearedState = (): LoginState => ({ failedAttempts: 0, lockoutLevel: 0, lockedUntil: null });
