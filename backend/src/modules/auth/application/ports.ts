// Puertos de SALIDA del módulo auth (lo que el núcleo necesita del mundo exterior).
import { Device, DeviceStatus } from '../domain/device';
import { LoginState } from '../domain/lockout-policy';
import { RevokeReason, Session } from '../domain/session';
import { User } from '../domain/user';

export const USER_REPOSITORY = Symbol('USER_REPOSITORY');
export const SESSION_REPOSITORY = Symbol('SESSION_REPOSITORY');
export const DEVICE_REPOSITORY = Symbol('DEVICE_REPOSITORY');
export const PASSWORD_HASHER = Symbol('PASSWORD_HASHER');
export const TOKEN_SERVICE = Symbol('TOKEN_SERVICE');
export const SECURITY_EVENT_LOG = Symbol('SECURITY_EVENT_LOG');
export const CLOCK = Symbol('CLOCK');

export interface UserRepository {
  findByEmail(email: string): Promise<User | null>;
  findById(id: string): Promise<User | null>;
  saveLoginState(id: string, state: LoginState & { lastLoginAt?: Date }): Promise<void>;
  /** Actualiza hash, quita mustChangePassword, limpia bloqueos y agrega al historial (una transacción). */
  changePassword(id: string, passwordHash: string, at: Date): Promise<void>;
  getPasswordHistory(id: string, limit: number): Promise<string[]>;
}

export interface SessionWithOwner {
  session: Session;
  user: { id: string; status: User['status']; mustChangePassword: boolean };
  device: { id: string; status: DeviceStatus };
}

export interface SessionRepository {
  create(input: {
    userId: string; deviceId: string; refreshHash: string;
    ip?: string; userAgent?: string; now: Date; absoluteExpiresAt: Date;
  }): Promise<Session>;
  findWithOwner(sessionId: string): Promise<SessionWithOwner | null>; // una sola consulta por petición
  findByRefreshHash(hash: string): Promise<Session | null>;
  findByPrevRefreshHash(hash: string): Promise<Session | null>;
  /** Sesiones vivas = no revocadas, dentro de la duración absoluta y con actividad reciente. */
  countLive(userId: string, p: { now: Date; inactiveBefore: Date }): Promise<number>;
  /** Rotación atómica: devuelve false si el refresh ya no era el vigente (carrera). */
  rotate(id: string, p: { oldHash: string; newHash: string; at: Date }): Promise<boolean>;
  touch(id: string, at: Date): Promise<void>;
  revoke(id: string, reason: RevokeReason, at: Date): Promise<void>;
  revokeAllForUser(userId: string, reason: RevokeReason, at: Date, exceptSessionId?: string): Promise<void>;
}

export interface DeviceRepository {
  findByKeyHash(userId: string, keyHash: string): Promise<Device | null>;
  create(input: {
    userId: string; keyHash: string; label: string; ip?: string; userAgent?: string; now: Date;
  }): Promise<Device>; // siempre PENDING
  touch(id: string, ip: string | undefined, at: Date): Promise<void>;
}

export interface PasswordHasher {
  hash(plain: string): Promise<string>;
  verify(hash: string, plain: string): Promise<boolean>;
  /** Gasta el mismo tiempo que una verificación real (anti-enumeración por tiempo). */
  verifyDummy(plain: string): Promise<void>;
}

export interface TokenService {
  signAccess(p: { userId: string; sessionId: string }, ttlSeconds: number): string;
  verifyAccess(token: string): { userId: string; sessionId: string } | null;
  generateOpaqueToken(): string;
  hashToken(token: string): string;
}

export interface SecurityEventInput {
  type: string;
  userId?: string;
  deviceId?: string;
  sessionId?: string;
  ip?: string;
  userAgent?: string;
  metadata?: Record<string, unknown>;
}
export interface SecurityEventLog {
  record(event: SecurityEventInput): Promise<void>;
}

export interface Clock {
  now(): Date;
}
