import { Inject, Injectable } from '@nestjs/common';
import { ValidationError } from '../../../shared/domain/domain-error';
import { MAILER, Mailer } from '../../mail/mail.public-api';
import { InvalidResetCodeError, PasswordResetDisabledError } from '../domain/auth-errors';
import { isUsable, isWellFormedCode, PASSWORD_RESET } from '../domain/password-reset';
import { PASSWORD_RULES, validatePassword } from '../domain/password-policy';
import { passwordChangedEmail } from '../domain/reset-email';
import { normalizeEmail } from '../domain/user';
import {
  CLOCK, Clock, OTP_SERVICE, OtpService, PASSWORD_HASHER, PASSWORD_RESET_REPOSITORY, PasswordHasher, PasswordResetRepository,
  SECURITY_EVENT_LOG, SecurityEventLog, SESSION_REPOSITORY, SessionRepository, USER_REPOSITORY, UserRepository,
} from './ports';

/**
 * Paso 2: código + contraseña nueva en una sola petición (no hay "token intermedio" que robar).
 * Todo fallo de código devuelve el mismo error genérico. Al terminar se cierran TODAS las sesiones.
 */
@Injectable()
export class ConfirmPasswordResetUseCase {
  constructor(
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    @Inject(SESSION_REPOSITORY) private readonly sessions: SessionRepository,
    @Inject(PASSWORD_RESET_REPOSITORY) private readonly resets: PasswordResetRepository,
    @Inject(OTP_SERVICE) private readonly otp: OtpService,
    @Inject(PASSWORD_HASHER) private readonly hasher: PasswordHasher,
    @Inject(MAILER) private readonly mailer: Mailer,
    @Inject(SECURITY_EVENT_LOG) private readonly events: SecurityEventLog,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(input: { email: string; code: string; newPassword: string; ip?: string; userAgent?: string }): Promise<void> {
    if (!this.mailer.enabled) throw new PasswordResetDisabledError();
    const ctx = { ip: input.ip, userAgent: input.userAgent };
    const now = this.clock.now();
    const user = await this.users.findByEmail(normalizeEmail(input.email));
    const reject = async (reason: string, userId?: string): Promise<never> => {
      await this.events.record({ type: 'PASSWORD_RESET_FAILED', userId, ...ctx, metadata: { reason } });
      throw new InvalidResetCodeError();
    };

    if (!user || user.status !== 'ACTIVE') {
      await this.hasher.verifyDummy(input.newPassword); // mismo trabajo que un caso real
      return reject(user ? 'USER_NOT_ACTIVE' : 'UNKNOWN_EMAIL', user?.id);
    }
    const record = await this.resets.find(user.id);
    if (!record || !isUsable(record, now)) return reject(record ? 'EXPIRED_OR_LOCKED' : 'NO_CODE', user.id);

    const codeHash = this.otp.hash(user.id, input.code);
    if (!isWellFormedCode(input.code) || !this.otp.matches(record.codeHash, user.id, input.code)) {
      const failures = await this.resets.registerFailure(user.id, PASSWORD_RESET.maxAttempts);
      return reject(failures >= PASSWORD_RESET.maxAttempts ? 'TOO_MANY_ATTEMPTS' : 'WRONG_CODE', user.id);
    }

    // El código es correcto. Si la contraseña no cumple, NO se gasta el código: la persona puede corregirla.
    const problems = validatePassword(input.newPassword, { email: user.email });
    if (problems.length) throw new ValidationError(problems.join('. '));
    const recent = await this.users.getPasswordHistory(user.id, PASSWORD_RULES.historySize);
    for (const old of new Set([user.passwordHash, ...recent].filter((h): h is string => !!h))) {
      if (await this.hasher.verify(old, input.newPassword)) {
        throw new ValidationError(`No puedes reutilizar ninguna de tus últimas ${PASSWORD_RULES.historySize} contraseñas`);
      }
    }

    // Un solo uso, también frente a peticiones simultáneas.
    if (!(await this.resets.consume(user.id, codeHash))) return reject('ALREADY_USED', user.id);

    await this.users.changePassword(user.id, await this.hasher.hash(input.newPassword), now);
    await this.sessions.revokeAllForUser(user.id, 'PASSWORD_CHANGED', now);
    await this.events.record({ type: 'PASSWORD_RESET_COMPLETED', userId: user.id, ...ctx });

    const msg = passwordChangedEmail(user.displayName);
    void this.mailer.send({ to: user.email, ...msg }).catch(() => undefined); // aviso informativo: no debe romper el cambio
  }
}
