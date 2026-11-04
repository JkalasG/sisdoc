export const PASSWORD_RESET = {
  codeLength: 6,
  ttlMs: 10 * 60_000, // el código vale 10 minutos
  maxAttempts: 5, // fallos permitidos por código; al quinto se invalida y hay que pedir otro
  resendCooldownMs: 60_000, // entre un envío y el siguiente
  maxSendsPerHour: 5, // por cuenta: frena el bombardeo de correos a una víctima
  windowMs: 60 * 60_000,
} as const;

export interface ResetCode {
  userId: string;
  codeHash: string;
  expiresAt: Date;
  attempts: number;
  lastSentAt: Date;
  windowStartedAt: Date;
  sentInWindow: number;
}

export type SendDecision =
  | { allowed: true; windowStartedAt: Date; sentInWindow: number }
  | { allowed: false; reason: 'COOLDOWN' | 'HOURLY_LIMIT' };

/** ¿Se puede enviar otro código a esta cuenta ahora? `current` es el registro anterior, si lo hay. */
export function decideSend(current: ResetCode | null, now: Date): SendDecision {
  if (!current) return { allowed: true, windowStartedAt: now, sentInWindow: 1 };
  if (now.getTime() - current.lastSentAt.getTime() < PASSWORD_RESET.resendCooldownMs) return { allowed: false, reason: 'COOLDOWN' };
  const windowOpen = now.getTime() - current.windowStartedAt.getTime() < PASSWORD_RESET.windowMs;
  if (!windowOpen) return { allowed: true, windowStartedAt: now, sentInWindow: 1 };
  if (current.sentInWindow >= PASSWORD_RESET.maxSendsPerHour) return { allowed: false, reason: 'HOURLY_LIMIT' };
  return { allowed: true, windowStartedAt: current.windowStartedAt, sentInWindow: current.sentInWindow + 1 };
}

export const isUsable = (c: ResetCode, now: Date): boolean =>
  c.expiresAt.getTime() > now.getTime() && c.attempts < PASSWORD_RESET.maxAttempts;

export const isWellFormedCode = (code: string): boolean => new RegExp(`^\\d{${PASSWORD_RESET.codeLength}}$`).test(code);
