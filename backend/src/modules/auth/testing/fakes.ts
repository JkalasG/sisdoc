// Adaptadores EN MEMORIA de los puertos de auth: permiten probar los casos de uso sin base de datos.
import { LoginUseCase } from '../application/login.use-case';
import { RefreshSessionUseCase } from '../application/refresh-session.use-case';
import { AuthenticateRequestUseCase } from '../application/authenticate-request.use-case';
import { LogoutUseCase } from '../application/logout.use-case';
import { ChangePasswordUseCase } from '../application/change-password.use-case';
import {
  Clock, DeviceRepository, PasswordHasher, SecurityEventInput, SecurityEventLog,
  SessionRepository, SessionWithOwner, TokenService, UserRepository,
} from '../application/ports';
import { Device, DeviceStatus } from '../domain/device';
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
  async create(i: { userId: string; keyHash: string; label: string; ip?: string }) {
    const d: Device = {
      id: `dev-${++this.n}`, userId: i.userId, keyHash: i.keyHash, label: i.label, status: 'PENDING', lastIp: i.ip ?? null,
    };
    this.devices.push(d);
    return d;
  }
  async touch(id: string, ip?: string) {
    const d = this.devices.find((x) => x.id === id)!;
    d.lastIp = ip ?? d.lastIp;
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
      prevRefreshHash: null, ip: i.ip ?? null, userAgent: i.userAgent ?? null,
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
    s.prevRefreshHash = p.oldHash; s.refreshHash = p.newHash; s.lastActivityAt = p.at;
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

export const buildUser = (over: Partial<User> = {}): User => ({
  id: 'user-1', email: 'ana@empresa.com', displayName: 'Ana', passwordHash: 'h:Clave-Segura-2026',
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

  const login = new LoginUseCase(users, sessions, devices, hasher, tokens, events, clock);
  const refresh = new RefreshSessionUseCase(sessions, tokens, events, clock);
  const authenticate = new AuthenticateRequestUseCase(sessions, tokens, clock);
  const logout = new LogoutUseCase(sessions, tokens, events, clock);
  const changePassword = new ChangePasswordUseCase(users, sessions, hasher, events, clock);

  /** Atajo: usuario con dispositivo ya aprobado, listo para iniciar sesión. */
  async function userWithTrustedDevice(over: Partial<User> = {}, deviceKey = 'dk-1') {
    const user = users.add(buildUser(over));
    const device = await devices.create({ userId: user.id, keyHash: tokens.hashToken(deviceKey), label: 'Chrome en Windows' });
    devices.setStatus(device.id, 'TRUSTED');
    return { user, device, deviceKey };
  }

  const doLogin = (over: Partial<Parameters<LoginUseCase['execute']>[0]> = {}) =>
    login.execute({ email: 'ana@empresa.com', password: PASSWORD, deviceKey: 'dk-1', ip: '10.0.0.5', userAgent: UA, ...over });

  return { clock, hasher, tokens, events, users, devices, sessions, login, refresh, authenticate, logout, changePassword, userWithTrustedDevice, doLogin };
}
