// Puertos de SALIDA del módulo auth (lo que el núcleo necesita del mundo exterior).
import { Device, DeviceStatus } from '../domain/device';
import { LoginState } from '../domain/lockout-policy';
import { RevokeReason, Session } from '../domain/session';
import { GoogleProfile } from '../domain/google-policy';
import { ResetCode } from '../domain/password-reset';
import { User } from '../domain/user';

export const USER_REPOSITORY = Symbol('USER_REPOSITORY');
export const SESSION_REPOSITORY = Symbol('SESSION_REPOSITORY');
export const DEVICE_REPOSITORY = Symbol('DEVICE_REPOSITORY');
export const PASSWORD_HASHER = Symbol('PASSWORD_HASHER');
export const TOKEN_SERVICE = Symbol('TOKEN_SERVICE');
export const SECURITY_EVENT_LOG = Symbol('SECURITY_EVENT_LOG');
export const CLOCK = Symbol('CLOCK');
export const CAPTCHA_VERIFIER = Symbol('CAPTCHA_VERIFIER');
export const GOOGLE_IDENTITY = Symbol('GOOGLE_IDENTITY');
export const AUTH_PUBLIC_CONFIG = Symbol('AUTH_PUBLIC_CONFIG');
export const PASSWORD_RESET_REPOSITORY = Symbol('PASSWORD_RESET_REPOSITORY');
export const OTP_SERVICE = Symbol('OTP_SERVICE');

export interface UserRepository {
  findByEmail(email: string): Promise<User | null>;
  findById(id: string): Promise<User | null>;
  findByGoogleSub(sub: string): Promise<User | null>;
  /** Vincula la cuenta de Google al usuario (solo si aún no tenía una). */
  linkGoogle(id: string, sub: string): Promise<void>;
  /** Registro con Google: cuenta PENDING, sin contraseña. Si otra petición la creó a la vez, devuelve esa. */
  createPendingFromGoogle(i: { email: string; displayName: string; googleSub: string }): Promise<User>;
  saveLoginState(id: string, state: LoginState & { lastLoginAt?: Date }): Promise<void>;
  /** Actualiza hash, quita mustChangePassword, limpia bloqueos y agrega al historial (una transacción). */
  changePassword(id: string, passwordHash: string, at: Date): Promise<void>;
  getPasswordHistory(id: string, limit: number): Promise<string[]>;
}

/** Captcha del login con contraseña. `enabled=false` = no se exige ni se pide en pantalla. */
export interface CaptchaVerifier {
  readonly enabled: boolean;
  /** Falso si falta el token, es inválido, ya se usó o el proveedor no responde (falla cerrado). */
  verify(token: string | undefined, ip?: string): Promise<boolean>;
}

/** Verificación del ID token de Google. Devuelve null si la firma, el emisor o la audiencia no son válidos. */
export interface GoogleIdentity {
  readonly enabled: boolean;
  readonly allowedDomain: string | null;
  /** true = quien entra por primera vez con Google se registra (queda PENDING); false = solo cuentas creadas por un administrador. */
  readonly autoRegister: boolean;
  verify(idToken: string): Promise<GoogleProfile | null>;
}

/** Lo que el navegador necesita saber para mostrar (u ocultar) captcha y Google. Nunca incluye secretos. */
export interface AuthPublicConfig {
  captcha: { enabled: boolean; siteKey: string | null };
  google: { enabled: boolean; clientId: string | null };
  /** Solo se ofrece si el sistema puede enviar correos. */
  passwordReset: { enabled: boolean };
}

export interface PasswordResetRepository {
  find(userId: string): Promise<ResetCode | null>;
  /** Deja UN solo código vigente por usuario: el nuevo reemplaza al anterior. */
  save(code: ResetCode): Promise<void>;
  /** Suma un fallo. Devuelve los fallos acumulados; al llegar al máximo el código se elimina. */
  registerFailure(userId: string, max: number): Promise<number>;
  /** Borra el código SOLO si sigue siendo ese (atómico): de dos peticiones simultáneas con el código correcto, una sola lo consume. */
  consume(userId: string, codeHash: string): Promise<boolean>;
  delete(userId: string): Promise<void>;
}

export interface OtpService {
  /** Código numérico aleatorio criptográficamente seguro. */
  generate(): string;
  /** HMAC con una clave del servidor y el usuario: una base de datos robada no basta para recuperar los códigos. */
  hash(userId: string, code: string): string;
  matches(expectedHash: string, userId: string, code: string): boolean; // tiempo constante
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
  /** Descarta los PENDING vencidos y deja a lo sumo `keep` (los más recientes). Nunca toca TRUSTED ni BLOCKED. */
  prunePending(userId: string, keep: number, olderThan: Date): Promise<number>;
}

export const ADMIN_DEVICE_REPOSITORY = Symbol('ADMIN_DEVICE_REPOSITORY');

export interface AdminDeviceRow {
  id: string; userId: string; user: string; email: string; label: string; ip: string;
  firstIp: string; code: string; userAgent: string; // para distinguir un equipo de otro del mismo usuario
  status: 'PENDING' | 'TRUSTED' | 'BLOCKED'; firstSeen: string; lastSeen: string;
}

/** Vista de administración sobre los dispositivos de todos los usuarios. */
export interface AdminDeviceRepository {
  listAll(): Promise<AdminDeviceRow[]>;
  /** Aprueba o bloquea; bloquear también revoca sus sesiones. Devuelve false si el dispositivo no existe. */
  decide(id: string, status: 'TRUSTED' | 'BLOCKED', adminId: string): Promise<boolean>;
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
