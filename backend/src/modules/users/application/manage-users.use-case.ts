import { Inject, Injectable } from '@nestjs/common';
import { ForbiddenError, NotFoundError } from '../../../shared/domain/domain-error';
import {
  Account, AccountStatus, assertCanChangeRoles, assertCanDisable, isAdmin, validateNewAccount, validateRoles,
} from '../domain/user-account';
import {
  ALLOWED_EMAIL_DOMAINS, CLOCK, Clock, PASSWORD_HASHER, PasswordHasher, SECURITY_EVENTS, SecurityEvents,
  TEMP_PASSWORD_GENERATOR, TempPasswordGenerator, USER_ADMIN_REPOSITORY, UserAdminRepository,
} from './ports';

const INACTIVITY_MS = 30 * 60_000; // misma ventana que usa auth para considerar viva una sesión

export interface Ctx { actorId: string; ip?: string; userAgent?: string }

/** Administración de cuentas: solo para administradores activos. Toda acción deja un evento de seguridad. */
@Injectable()
export class ManageUsersUseCase {
  constructor(
    @Inject(USER_ADMIN_REPOSITORY) private readonly users: UserAdminRepository,
    @Inject(PASSWORD_HASHER) private readonly hasher: PasswordHasher,
    @Inject(TEMP_PASSWORD_GENERATOR) private readonly passwords: TempPasswordGenerator,
    @Inject(SECURITY_EVENTS) private readonly events: SecurityEvents,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(ALLOWED_EMAIL_DOMAINS) private readonly allowedDomains: readonly string[],
  ) {}

  private async assertAdmin(actorId: string) {
    const actor = await this.users.findActor(actorId);
    if (!actor || !isAdmin(actor)) throw new ForbiddenError('Solo administradores');
  }

  private async load(id: string): Promise<Account> {
    const now = this.clock.now();
    const account = await this.users.findById(id, now, new Date(now.getTime() - INACTIVITY_MS));
    if (!account) throw new NotFoundError('Usuario');
    return account;
  }

  private audit(type: string, ctx: Ctx, userId: string, metadata: Record<string, unknown> = {}) {
    return this.events.record({ type, userId, ip: ctx.ip, userAgent: ctx.userAgent, metadata: { by: ctx.actorId, ...metadata } });
  }

  async list(actorId: string, filter: { q?: string; status?: AccountStatus } = {}) {
    await this.assertAdmin(actorId);
    const now = this.clock.now();
    const q = filter.q?.trim() || undefined;
    return this.users.list({ q, status: filter.status }, now, new Date(now.getTime() - INACTIVITY_MS));
  }

  /** Crea la cuenta con una clave temporal que se devuelve UNA sola vez y que el usuario debe cambiar al entrar. */
  async create(ctx: Ctx, input: { email: string; displayName: string; roles?: string[] }) {
    await this.assertAdmin(ctx.actorId);
    const data = validateNewAccount(input, this.allowedDomains);
    const temporaryPassword = this.passwords.generate();
    const id = await this.users.create({
      ...data, passwordHash: await this.hasher.hash(temporaryPassword), createdById: ctx.actorId,
    });
    await this.audit('USER_CREATED', ctx, id, { roles: data.roles });
    return { user: await this.load(id), temporaryPassword };
  }

  async disable(ctx: Ctx, id: string) {
    await this.assertAdmin(ctx.actorId);
    const target = await this.load(id);
    assertCanDisable(ctx.actorId, target, await this.users.countActiveAdmins());
    await this.users.setStatus(id, 'DISABLED');
    await this.users.revokeSessions(id, 'USER_DISABLED', this.clock.now());
    await this.audit('USER_DISABLED', ctx, id);
    return this.load(id);
  }

  async enable(ctx: Ctx, id: string) {
    await this.assertAdmin(ctx.actorId);
    await this.load(id);
    await this.users.setStatus(id, 'ACTIVE');
    await this.audit('USER_ENABLED', ctx, id);
    return this.load(id);
  }

  async unlock(ctx: Ctx, id: string) {
    await this.assertAdmin(ctx.actorId);
    await this.load(id);
    await this.users.unlock(id);
    await this.audit('USER_UNLOCKED', ctx, id);
    return this.load(id);
  }

  /** Nueva clave temporal: cierra todas las sesiones del usuario y lo obliga a cambiarla. */
  async resetPassword(ctx: Ctx, id: string) {
    await this.assertAdmin(ctx.actorId);
    await this.load(id);
    const temporaryPassword = this.passwords.generate();
    const now = this.clock.now();
    await this.users.resetPassword(id, await this.hasher.hash(temporaryPassword), now);
    await this.users.revokeSessions(id, 'ADMIN', now);
    await this.audit('USER_PASSWORD_RESET', ctx, id);
    return { user: await this.load(id), temporaryPassword };
  }

  async setRoles(ctx: Ctx, id: string, roles: string[]) {
    await this.assertAdmin(ctx.actorId);
    const target = await this.load(id);
    const before = [...target.roles];
    const next = validateRoles(roles);
    assertCanChangeRoles(ctx.actorId, target, next, await this.users.countActiveAdmins());
    await this.users.setRoles(id, next);
    await this.audit('USER_ROLES_CHANGED', ctx, id, { from: before, to: next });
    return this.load(id);
  }
}
