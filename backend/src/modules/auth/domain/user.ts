export type UserStatus = 'ACTIVE' | 'DISABLED';

export interface User {
  id: string;
  email: string;
  displayName: string;
  passwordHash: string | null;
  status: UserStatus;
  roles?: string[];
  mustChangePassword: boolean;
  failedAttempts: number;
  lockoutLevel: number;
  lockedUntil: Date | null;
  passwordChangedAt: Date;
  lastLoginAt: Date | null;
}

export const normalizeEmail = (email: string): string => email.trim().toLowerCase();
