import { Inject, Injectable } from '@nestjs/common';
import { MAILER, Mailer } from '../../mail/mail.public-api';
import { CaptchaFailedError, PasswordResetDisabledError } from '../domain/auth-errors';
import { decideSend, PASSWORD_RESET } from '../domain/password-reset';
import { resetCodeEmail } from '../domain/reset-email';
import { normalizeEmail } from '../domain/user';
import {
  CAPTCHA_VERIFIER, CaptchaVerifier, CLOCK, Clock, OTP_SERVICE, OtpService, PASSWORD_RESET_REPOSITORY, PasswordResetRepository,
  SECURITY_EVENT_LOG, SecurityEventLog, USER_REPOSITORY, UserRepository,
} from './ports';

/**
 * Paso 1: pedir el código. La respuesta es SIEMPRE la misma exista o no el correo, esté o no limitada la cuenta:
 * así no sirve para descubrir qué correos están registrados. El motivo real solo queda en la bitácora.
 */
@Injectable()
export class RequestPasswordResetUseCase {
  constructor(
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    @Inject(PASSWORD_RESET_REPOSITORY) private readonly resets: PasswordResetRepository,
    @Inject(OTP_SERVICE) private readonly otp: OtpService,
    @Inject(MAILER) private readonly mailer: Mailer,
    @Inject(CAPTCHA_VERIFIER) private readonly captcha: CaptchaVerifier,
    @Inject(SECURITY_EVENT_LOG) private readonly events: SecurityEventLog,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(input: { email: string; captchaToken?: string; ip?: string; userAgent?: string }): Promise<void> {
    if (!this.mailer.enabled) throw new PasswordResetDisabledError();
    const ctx = { ip: input.ip, userAgent: input.userAgent };
    // Sin captcha, cualquiera podría usar este formulario para llenarle el correo a otra persona.
    if (this.captcha.enabled && !(await this.captcha.verify(input.captchaToken, input.ip))) {
      await this.events.record({ type: 'CAPTCHA_FAIL', ...ctx, metadata: { flow: 'PASSWORD_RESET' } });
      throw new CaptchaFailedError();
    }

    const now = this.clock.now();
    const email = normalizeEmail(input.email);
    const user = await this.users.findByEmail(email);
    const skip = (reason: string, userId?: string) =>
      this.events.record({ type: 'PASSWORD_RESET_SKIPPED', userId, ...ctx, metadata: { reason } });

    // Cuentas sin acceso (deshabilitadas o sin activar) no pueden recuperar nada por esta vía.
    if (!user || user.status !== 'ACTIVE') return skip(user ? 'USER_NOT_ACTIVE' : 'UNKNOWN_EMAIL', user?.id);

    const decision = decideSend(await this.resets.find(user.id), now);
    if (!decision.allowed) return skip(decision.reason, user.id);

    const code = this.otp.generate();
    await this.resets.save({
      userId: user.id, codeHash: this.otp.hash(user.id, code), expiresAt: new Date(now.getTime() + PASSWORD_RESET.ttlMs),
      attempts: 0, lastSentAt: now, windowStartedAt: decision.windowStartedAt, sentInWindow: decision.sentInWindow,
    });
    await this.events.record({ type: 'PASSWORD_RESET_REQUESTED', userId: user.id, ...ctx });

    // Sin esperar a Gmail: así la respuesta tarda igual para un correo real y para uno inexistente.
    const msg = resetCodeEmail(user.displayName, code, PASSWORD_RESET.ttlMs / 60_000);
    void this.mailer.send({ to: user.email, ...msg }).catch(() =>
      this.events.record({ type: 'PASSWORD_RESET_MAIL_FAILED', userId: user.id, ...ctx }));
  }
}
