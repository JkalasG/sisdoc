// Adaptadores EN MEMORIA de los puertos de auth: permiten probar los casos de uso sin base de datos.
import { ConfirmPasswordResetUseCase } from '../application/confirm-password-reset.use-case';
import { LoginWithGoogleUseCase } from '../application/login-google.use-case';
import { RequestPasswordResetUseCase } from '../application/request-password-reset.use-case';
import { LoginUseCase } from '../application/login.use-case';
import { RefreshSessionUseCase } from '../application/refresh-session.use-case';
import { AuthenticateRequestUseCase } from '../application/authenticate-request.use-case';
import { LogoutUseCase } from '../application/logout.use-case';
import { ChangePasswordUseCase } from '../application/change-password.use-case';
import {
  CaptchaVerifier, Clock, DeviceRepository, GoogleIdentity, OtpService, PasswordResetRepository, PasswordHasher, SecurityEventInput, SecurityEventLog,
  SessionRepository, SessionWithOwner, TokenService, UserRepository,
} from '../application/ports';
import { Device, DeviceStatus } from '../domain/device';
import { GoogleProfile } from '../domain/google-policy';
import { ResetCode } from '../domain/password-reset';
import { Mailer, MailMessage } from '../../mail/mail.public-api';
import { LoginState } from '../domain/lockout-policy';
import { RevokeReason, Session } from '../domain/session';
import { User } from '../domain/user';

export class FakeClock implements Clock {
  constructor(public current = new Date('2026-03-02T10:00:00.000Z')) {}
  now() { return new Date(this.current); }
  advance(ms: number) { this.current = new Date(this.current.getTime() + ms); }
}
export const minutes = (n: number) => n * 60_000;
export const hours = (n: number) => n * 3_600_000;

export class FakeHasher implements PasswordHasher {
  dummyCalls = 0;
  verifyCalls = 0;
  async hash(plain: string) { return `h:${plain}`; }
  async verify(hash: string, plain: string) { this.verifyCalls++; return hash === `h:${plain}`; }
  async verifyDummy() { this.dummyCalls++; }
}

export class FakeTokens implements TokenService {
  private n = 0;
  signAccess(p: { userId: string; sessionId: string }) { return `jwt|${p.userId}|${p.sessionId}`; }
  verifyAccess(token: string) {
    const [k, userId, sessionId] = token.split('|');
    return k === 'jwt' && userId && sessionId ? { userId, sessionId } : null;
  }
  generateOpaqueToken() { return `tok-${++this.n}`; }
  hashToken(t: string) { return `sha:${t}`; }
}

export class FakeEvents implements SecurityEventLog {
  events: SecurityEventInput[] = [];
  async record(e: SecurityEventInput) { this.events.push(e); }
  types() { return this.events.map((e) => e.type); }
  last(type: string) { return [...this.events].reverse().find((e) => e.type === type); }
}

export class InMemoryUsers implements UserRepository {
  users = new Map<string, User>();
  history = new Map<string, string[]>();
  add(u: User) { this.users.set(u.id, u); this.history.set(u.id, []); return u; }
  async findByEmail(email: string) { return [...this.users.values()].find((u) => u.email === email) ?? null; }
  async findById(id: string) { return this.users.get(id) ?? null; }
  async findByGoogleSub(sub: string) { return [...this.users.values()].find((u) => u.googleSub === sub) ?? null; }
  async linkGoogle(id: string, sub: string) { const u = this.users.get(id)!; if (!u.googleSub) u.googleSub = sub; }
  async createPendingFromGoogle(i: { email: string; displayName: string; googleSub: string }) {
    const existing = [...this.users.values()].find((u) => u.email === i.email);
    if (existing) return existing;
    return this.add(buildUser({
      id: `user-${this.users.size + 1}`, email: i.email, displayName: i.displayName, googleSub: i.googleSub,
      passwordHash: null, status: 'PENDING', mustChangePassword: false, roles: ['USUARIO'],
    }));
  }
  async saveLoginState(id: string, s: LoginState & { lastLoginAt?: Date }) {
    Object.assign(this.users.get(id)!, s);
  }
  async changePassword(id: string, passwordHash: string, at: Date) {
    Object.assign(this.users.get(id)!, {
      passwordHash, mustChangePassword: false, passwordChangedAt: at,
      failedAttempts: 0, lockoutLevel: 0, lockedUntil: null,
    });
    this.history.get(id)!.unshift(passwordHash);
  }
  async getPasswordHistory(id: string, limit: number) { return this.history.get(id)!.slice(0, limit); }
}

export class InMemoryDevices implements DeviceRepository {
  devices: Device[] = [];
  private n = 0;
  async findByKeyHash(userId: string, keyHash: string) {
    return this.devices.find((d) => d.userId === userId && d.keyHash === keyHash) ?? null;
  }
  async create(i: { userId: string; keyHash: string; label: string; ip?: string; now?: Date }) {
    const d: Device = {
      id: `dev-${++this.n}`, userId: i.userId, keyHash: i.keyHash, label: i.label, status: 'PENDING', lastIp: i.ip ?? null,
      firstSeenAt: i.now,
    };
    this.devices.push(d);
    return d;
  }
  async touch(id: string, ip?: string) {
    const d = this.devices.find((x) => x.id === id)!;
    d.lastIp = ip ?? d.lastIp;
  }
  async prunePending(userId: string, keep: number, olderThan: Date) {
    const mine = this.devices.filter((d) => d.userId === userId && d.status === 'PENDING')
      .sort((a, b) => (b.firstSeenAt?.getTime() ?? 0) - (a.firstSeenAt?.getTime() ?? 0));
    const drop = new Set(mine.filter((d, i) => i >= keep || (d.firstSeenAt && d.firstSeenAt < olderThan)));
    this.devices = this.devices.filter((d) => !drop.has(d));
    return drop.size;
  }
  /** Simula la decisión del administrador. */
  setStatus(id: string, status: DeviceStatus) { this.devices.find((d) => d.id === id)!.status = status; }
}

export class InMemorySessions implements SessionRepository {
  sessions: Session[] = [];
  touches = 0;
  private n = 0;
  constructor(private users: InMemoryUsers, private devices: InMemoryDevices) {}

  async create(i: { userId: string; deviceId: string; refreshHash: string; ip?: string; userAgent?: string; now: Date; absoluteExpiresAt: Date }) {
    const s: Session = {
      id: `ses-${++this.n}`, userId: i.userId, deviceId: i.deviceId, refreshHash: i.refreshHash,
      prevRefreshHash: null, rotatedAt: null, ip: i.ip ?? null, userAgent: i.userAgent ?? null,
      createdAt: i.now, lastActivityAt: i.now, absoluteExpiresAt: i.absoluteExpiresAt,
      revokedAt: null, revokedReason: null,
    };
    this.sessions.push(s);
    return s;
  }
  get(id: string) { return this.sessions.find((s) => s.id === id)!; }
  async findWithOwner(sessionId: string): Promise<SessionWithOwner | null> {
    const session = this.sessions.find((s) => s.id === sessionId);
    if (!session) return null;
    const user = this.users.users.get(session.userId)!;
    const device = this.devices.devices.find((d) => d.id === session.deviceId)!;
    return {
      session,
      user: { id: user.id, status: user.status, mustChangePassword: user.mustChangePassword },
      device: { id: device.id, status: device.status },
    };
  }
  async findByRefreshHash(hash: string) { return this.sessions.find((s) => s.refreshHash === hash) ?? null; }
  async findByPrevRefreshHash(hash: string) { return this.sessions.find((s) => s.prevRefreshHash === hash) ?? null; }
  async countLive(userId: string, p: { now: Date; inactiveBefore: Date }) {
    return this.sessions.filter((s) =>
      s.userId === userId && !s.revokedAt && s.absoluteExpiresAt > p.now && s.lastActivityAt > p.inactiveBefore).length;
  }
  async rotate(id: string, p: { oldHash: string; newHash: string; at: Date }) {
    const s = this.get(id);
    if (s.refreshHash !== p.oldHash || s.revokedAt) return false;
    s.prevRefreshHash = p.oldHash; s.rotatedAt = p.at; s.refreshHash = p.newHash; s.lastActivityAt = p.at;
    return true;
  }
  async touch(id: string, at: Date) { this.touches++; this.get(id).lastActivityAt = at; }
  async revoke(id: string, reason: RevokeReason, at: Date) {
    const s = this.get(id);
    if (!s.revokedAt) { s.revokedAt = at; s.revokedReason = reason; }
  }
  async revokeAllForUser(userId: string, reason: RevokeReason, at: Date, except?: string) {
    for (const s of this.sessions) if (s.userId === userId && s.id !== except && !s.revokedAt) { s.revokedAt = at; s.revokedReason = reason; }
  }
}

/** Captcha de pruebas: con `enabled` solo acepta los tokens que se le hayan registrado en `valid`. */
export class FakeCaptcha implements CaptchaVerifier {
  enabled = false;
  valid = new Set<string>();
  calls: Array<{ token?: string; ip?: string }> = [];
  async verify(token: string | undefined, ip?: string) {
    this.calls.push({ token, ip });
    return !!token && this.valid.has(token);
  }
}

/** Google de pruebas: el "ID token" es una clave de `profiles`; cualquier otro valor es un token inválido. */
export class FakeGoogle implements GoogleIdentity {
  enabled = false;
  allowedDomain: string | null = null;
  autoRegister = false;
  profiles = new Map<string, GoogleProfile>();
  async verify(idToken: string) { return this.profiles.get(idToken) ?? null; }
}

/** Correo de pruebas: guarda lo "enviado" para que la prueba pueda leer el código. */
export class FakeMailer implements Mailer {
  enabled = true;
  fail = false;
  sent: MailMessage[] = [];
  async send(m: MailMessage) {
    if (this.fail) throw new Error('Gmail caído');
    this.sent.push(m);
  }
  /** El último código de 6 dígitos enviado a ese correo. */
  lastCode(to: string): string | undefined {
    const m = [...this.sent].reverse().find((x) => x.to === to && /\d{6}/.test(x.text));
    return m?.text.match(/(\d{6})/)?.[1];
  }
}

export class InMemoryResets implements PasswordResetRepository {
  rows = new Map<string, ResetCode>();
  async find(userId: string) { return this.rows.get(userId) ?? null; }
  async save(c: ResetCode) { this.rows.set(c.userId, { ...c }); }
  async registerFailure(userId: string, max: number) {
    const r = this.rows.get(userId);
    if (!r) return max;
    r.attempts += 1;
    if (r.attempts >= max) this.rows.delete(userId);
    return r.attempts;
  }
  async consume(userId: string, codeHash: string) {
    const r = this.rows.get(userId);
    if (!r || r.codeHash !== codeHash) return false;
    this.rows.delete(userId);
    return true;
  }
  async delete(userId: string) { this.rows.delete(userId); }
}

/** OTP de pruebas: códigos predecibles (111111, 222222…) para no depender de aleatoriedad. */
export class FakeOtp implements OtpService {
  private n = 0;
  generate() { this.n += 1; return String(this.n).repeat(6).slice(0, 6); }
  hash(userId: string, code: string) { return `otp:${userId}:${code}`; }
  matches(expected: string, userId: string, code: string) { return expected === this.hash(userId, code); }
}

export const buildUser = (over: Partial<User> = {}): User => ({
  id: 'user-1', email: 'ana@empresa.com', displayName: 'Ana', passwordHash: 'h:Clave-Segura-2026', googleSub: null,
  status: 'ACTIVE', mustChangePassword: false, failedAttempts: 0, lockoutLevel: 0, lockedUntil: null,
  passwordChangedAt: new Date('2026-01-01T00:00:00Z'), lastLoginAt: null, ...over,
});

export const PASSWORD = 'Clave-Segura-2026';
export const UA = 'Mozilla/5.0 (Windows NT 10.0) Chrome/120.0 Safari/537.36';

/** Arma el "mundo" completo de pruebas con todos los puertos en memoria. */
export function buildWorld() {
  const clock = new FakeClock();
  const hasher = new FakeHasher();
  const tokens = new FakeTokens();
  const events = new FakeEvents();
  const users = new InMemoryUsers();
  const devices = new InMemoryDevices();
  const sessions = new InMemorySessions(users, devices);

  const captcha = new FakeCaptcha();
  const google = new FakeGoogle();
  const mailer = new FakeMailer();
  const resets = new InMemoryResets();
  const otp = new FakeOtp();
  const login = new LoginUseCase(users, sessions, devices, hasher, tokens, events, clock, captcha);
  const loginGoogle = new LoginWithGoogleUseCase(users, google, events, clock, devices, login);
  const refresh = new RefreshSessionUseCase(sessions, tokens, events, clock);
  const authenticate = new AuthenticateRequestUseCase(sessions, tokens, clock);
  const logout = new LogoutUseCase(sessions, tokens, events, clock);
  const changePassword = new ChangePasswordUseCase(users, sessions, hasher, events, clock);
  const requestReset = new RequestPasswordResetUseCase(users, resets, otp, mailer, captcha, events, clock);
  const confirmReset = new ConfirmPasswordResetUseCase(users, sessions, resets, otp, hasher, mailer, events, clock);

  /** Atajo: usuario con dispositivo ya aprobado, listo para iniciar sesión. */
  async function userWithTrustedDevice(over: Partial<User> = {}, deviceKey = 'dk-1') {
    const user = users.add(buildUser(over));
    const device = await devices.create({ userId: user.id, keyHash: tokens.hashToken(deviceKey), label: 'Chrome en Windows' });
    devices.setStatus(device.id, 'TRUSTED');
    return { user, device, deviceKey };
  }

  const doLogin = (over: Partial<Parameters<LoginUseCase['execute']>[0]> = {}) =>
    login.execute({ email: 'ana@empresa.com', password: PASSWORD, deviceKey: 'dk-1', ip: '10.0.0.5', userAgent: UA, ...over });

  return { clock, hasher, tokens, events, users, devices, sessions, captcha, google, mailer, resets, otp, login, loginGoogle, requestReset, confirmReset, refresh, authenticate, logout, changePassword, userWithTrustedDevice, doLogin };
}
