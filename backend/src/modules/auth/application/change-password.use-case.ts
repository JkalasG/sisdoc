import { Inject, Injectable } from '@nestjs/common';
import { UnauthenticatedError } from '../domain/auth-errors';
import { isLocked, registerFailure } from '../domain/lockout-policy';
import { PASSWORD_RULES, validatePassword } from '../domain/password-policy';
import { ValidationError } from '../../../shared/domain/domain-error';
import {
  CLOCK, Clock, PASSWORD_HASHER, PasswordHasher, SECURITY_EVENT_LOG, SecurityEventLog,
  SESSION_REPOSITORY, SessionRepository, USER_REPOSITORY, UserRepository,
} from './ports';

@Injectable()
export class ChangePasswordUseCase {
  constructor(
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    @Inject(SESSION_REPOSITORY) private readonly sessions: SessionRepository,
    @Inject(PASSWORD_HASHER) private readonly hasher: PasswordHasher,
    @Inject(SECURITY_EVENT_LOG) private readonly events: SecurityEventLog,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(input: {
    userId: string; sessionId: string; currentPassword: string; newPassword: string;
    ip?: string; userAgent?: string;
  }): Promise<void> {
    const now = this.clock.now();
    const ctx = { ip: input.ip, userAgent: input.userAgent };
    const user = await this.users.findById(input.userId);
    if (!user || user.status !== 'ACTIVE') throw new UnauthenticatedError();
    if (isLocked(user, now)) throw new ValidationError('Cuenta bloqueada temporalmente. Intenta más tarde.');

    // La contraseña actual cuenta para el bloqueo: una sesión robada no puede adivinarla a fuerza bruta.
    if (!user.passwordHash || !(await this.hasher.verify(user.passwordHash, input.currentPassword))) {
      await this.users.saveLoginState(user.id, registerFailure(user, now));
      await this.events.record({ type: 'PASSWORD_CHANGE_FAIL', userId: user.id, sessionId: input.sessionId, ...ctx });
      throw new ValidationError('La contraseña actual no es correcta');
    }

    const problems = validatePassword(input.newPassword, { email: user.email });
    if (problems.length) throw new ValidationError(problems.join('. '));

    const recent = await this.users.getPasswordHistory(user.id, PASSWORD_RULES.historySize);
    for (const old of new Set([user.passwordHash, ...recent])) {
      if (await this.hasher.verify(old, input.newPassword)) {
        throw new ValidationError(`No puedes reutilizar ninguna de tus últimas ${PASSWORD_RULES.historySize} contraseñas`);
      }
    }

    await this.users.changePassword(user.id, await this.hasher.hash(input.newPassword), now);
    // Todas las demás sesiones se cierran; la actual se conserva.
    await this.sessions.revokeAllForUser(user.id, 'PASSWORD_CHANGED', now, input.sessionId);
    await this.events.record({ type: 'PASSWORD_CHANGED', userId: user.id, sessionId: input.sessionId, ...ctx });
  }
}
