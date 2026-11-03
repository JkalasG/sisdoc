// Adaptadores EN MEMORIA de los puertos de users: permiten probar los casos de uso sin base de datos.
import { ConflictError } from '../../../shared/domain/domain-error';
import { ManageUsersUseCase } from '../application/manage-users.use-case';
import {
  Clock, PasswordHasher, SecurityEvents, TempPasswordGenerator, UserAdminRepository,
} from '../application/ports';
import { Account, AccountStatus } from '../domain/user-account';

export class FakeClock implements Clock {
  constructor(public current = new Date('2026-11-03T10:00:00.000Z')) {}
  now() { return new Date(this.current); }
}

export class FakeHasher implements PasswordHasher {
  async hash(plain: string) { return `h:${plain}`; }
}

export class FakePasswords implements TempPasswordGenerator {
  private n = 0;
  generate() { return `Temp-${++this.n}-Clave#2026`; }
}

export class FakeEvents implements SecurityEvents {
  events: Array<{ type: string; userId?: string; metadata?: Record<string, unknown> }> = [];
  async record(e: { type: string; userId?: string; metadata?: Record<string, unknown> }) { this.events.push(e); }
  types() { return this.events.map((e) => e.type); }
}

export class InMemoryUserAdmin implements UserAdminRepository {
  accounts = new Map<string, Account & { passwordHash?: string }>();
  history: Array<{ userId: string; hash: string }> = [];
  revoked: Array<{ userId: string; reason: string }> = [];
  private n = 0;

  add(over: Partial<Account> & { email: string }): Account {
    const a: Account = {
      id: `u-${++this.n}`, displayName: over.email.split('@')[0], status: 'ACTIVE', roles: ['USUARIO'],
      mustChangePassword: false, lockedUntil: null, lastLoginAt: null, createdAt: new Date('2026-01-01'), liveSessions: 0, ...over,
    };
    this.accounts.set(a.id, a);
    return a;
  }

  async findActor(id: string) {
    const a = this.accounts.get(id);
    return a ? { id: a.id, roles: a.roles, status: a.status } : null;
  }
  async list(filter: { q?: string; status?: AccountStatus }) {
    return [...this.accounts.values()].filter((a) =>
      (!filter.status || a.status === filter.status) &&
      (!filter.q || `${a.email} ${a.displayName}`.toLowerCase().includes(filter.q.toLowerCase())));
  }
  async findById(id: string) { return this.accounts.get(id) ?? null; }
  async emailExists(email: string) { return [...this.accounts.values()].some((a) => a.email === email); }
  async countActiveAdmins() {
    return [...this.accounts.values()].filter((a) => a.status === 'ACTIVE' && a.roles.includes('ADMIN')).length;
  }
  async create(i: { email: string; displayName: string; roles: string[]; passwordHash: string }) {
    if (await this.emailExists(i.email)) throw new ConflictError('Ya existe un usuario con ese correo');
    const a = this.add({ email: i.email, displayName: i.displayName, roles: i.roles, mustChangePassword: true });
    this.history.push({ userId: a.id, hash: i.passwordHash });
    return a.id;
  }
  async setStatus(id: string, status: AccountStatus) { this.accounts.get(id)!.status = status; }
  async setRoles(id: string, roles: string[]) { this.accounts.get(id)!.roles = roles; }
  async unlock(id: string) { this.accounts.get(id)!.lockedUntil = null; }
  async resetPassword(id: string, hash: string) {
    Object.assign(this.accounts.get(id)!, { mustChangePassword: true, lockedUntil: null });
    this.history.push({ userId: id, hash });
  }
  async revokeSessions(userId: string, reason: string) {
    this.revoked.push({ userId, reason });
    this.accounts.get(userId)!.liveSessions = 0;
  }
}

export function buildUsers(allowedDomains: string[] = []) {
  const repo = new InMemoryUserAdmin();
  const events = new FakeEvents();
  const clock = new FakeClock();
  const useCase = new ManageUsersUseCase(repo, new FakeHasher(), new FakePasswords(), events, clock, allowedDomains);
  const admin = repo.add({ email: 'admin@empresa.com', roles: ['ADMIN'] });
  return { repo, events, clock, useCase, admin, ctx: { actorId: admin.id } };
}
