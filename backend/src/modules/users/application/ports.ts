// Puertos de SALIDA del módulo users.
import { Account, AccountStatus } from '../domain/user-account';

export const USER_ADMIN_REPOSITORY = Symbol('USER_ADMIN_REPOSITORY');
export const PASSWORD_HASHER = Symbol('USERS_PASSWORD_HASHER');
export const TEMP_PASSWORD_GENERATOR = Symbol('TEMP_PASSWORD_GENERATOR');
export const SECURITY_EVENTS = Symbol('USERS_SECURITY_EVENTS');
export const CLOCK = Symbol('USERS_CLOCK');
export const ALLOWED_EMAIL_DOMAINS = Symbol('ALLOWED_EMAIL_DOMAINS');

export interface UserAdminRepository {
  /** Quién ejecuta la acción (para comprobar que es administrador activo). */
  findActor(id: string): Promise<{ id: string; roles: string[]; status: AccountStatus } | null>;
  list(filter: { q?: string; status?: AccountStatus }, now: Date, inactiveBefore: Date): Promise<Account[]>;
  findById(id: string, now: Date, inactiveBefore: Date): Promise<Account | null>;
  emailExists(email: string): Promise<boolean>;
  countActiveAdmins(): Promise<number>;
  /** Crea el usuario con clave temporal (debe cambiarla) y su historial de contraseñas. Lanza ConflictError si el correo ya existe. */
  create(input: { email: string; displayName: string; roles: string[]; passwordHash: string; createdById: string }): Promise<string>;
  setStatus(id: string, status: AccountStatus): Promise<void>;
  setRoles(id: string, roles: string[]): Promise<void>;
  /** Limpia intentos fallidos y bloqueo. */
  unlock(id: string): Promise<void>;
  /** Nueva clave temporal: obliga a cambiarla, limpia bloqueo y la agrega al historial. */
  resetPassword(id: string, passwordHash: string, at: Date): Promise<void>;
  /** Cierra todas las sesiones vivas del usuario. */
  revokeSessions(userId: string, reason: 'ADMIN' | 'USER_DISABLED', at: Date): Promise<void>;
}

export interface PasswordHasher {
  hash(plain: string): Promise<string>;
}

export interface TempPasswordGenerator {
  generate(): string;
}

export interface SecurityEvents {
  record(e: { type: string; userId?: string; ip?: string; userAgent?: string; metadata?: Record<string, unknown> }): Promise<void>;
}

export interface Clock {
  now(): Date;
}
