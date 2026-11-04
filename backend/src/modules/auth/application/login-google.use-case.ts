import { Inject, Injectable } from '@nestjs/common';
import { GoogleLoginDisabledError, InvalidCredentialsError } from '../domain/auth-errors';
import { displayNameFromGoogle, googleProfileProblem } from '../domain/google-policy';
import { clearedState, isLocked } from '../domain/lockout-policy';
import { normalizeEmail, User } from '../domain/user';
import { LoginResult, LoginUseCase } from './login.use-case';
import {
  CLOCK, Clock, DEVICE_REPOSITORY, DeviceRepository, GOOGLE_IDENTITY, GoogleIdentity, SECURITY_EVENT_LOG, SecurityEventLog, USER_REPOSITORY, UserRepository,
} from './ports';

/**
 * Acceso con Google: solo entra quien YA existe (sin auto-registro). Después de verificar la identidad aplica las mismas
 * reglas que la contraseña: cuenta activa y no bloqueada, dispositivo aprobado, límite de sesiones y auditoría.
 * Todos los rechazos devuelven el mismo error genérico; el motivo real queda solo en la bitácora.
 */
@Injectable()
export class LoginWithGoogleUseCase {
  constructor(
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    @Inject(GOOGLE_IDENTITY) private readonly google: GoogleIdentity,
    @Inject(SECURITY_EVENT_LOG) private readonly events: SecurityEventLog,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(DEVICE_REPOSITORY) private readonly devices: DeviceRepository,
    private readonly login: LoginUseCase,
  ) {}

  async execute(input: { idToken: string; deviceKey?: string; ip?: string; userAgent?: string }): Promise<LoginResult> {
    if (!this.google.enabled) throw new GoogleLoginDisabledError();
    const now = this.clock.now();
    const ctx = { ip: input.ip, userAgent: input.userAgent };
    const fail = async (reason: string, userId?: string): Promise<never> => {
      await this.events.record({ type: 'LOGIN_FAIL', userId, ...ctx, metadata: { reason, method: 'GOOGLE' } });
      throw new InvalidCredentialsError();
    };

    const profile = await this.google.verify(input.idToken);
    if (!profile) return fail('GOOGLE_INVALID_TOKEN');
    const problem = googleProfileProblem(profile, this.google.allowedDomain);
    if (problem) return fail(`GOOGLE_${problem}`);

    // El vínculo es por `sub` (estable); el correo solo sirve para encontrar la cuenta la primera vez.
    let user = await this.users.findByGoogleSub(profile.sub);
    if (!user) {
      const email = normalizeEmail(profile.email);
      const byEmail = await this.users.findByEmail(email);
      if (!byEmail) {
        if (!this.google.autoRegister) return fail('GOOGLE_UNKNOWN_EMAIL');
        // Primer ingreso: se registra, pero SIN acceso hasta que un administrador la active.
        const created = await this.users.createPendingFromGoogle({
          email, displayName: displayNameFromGoogle(profile), googleSub: profile.sub,
        });
        await this.events.record({ type: 'USER_SELF_REGISTERED', userId: created.id, ...ctx, metadata: { method: 'GOOGLE' } });
        return this.pendingActivation(created, input, now);
      }
      if (byEmail.googleSub && byEmail.googleSub !== profile.sub) return fail('GOOGLE_SUB_MISMATCH', byEmail.id);
      user = byEmail;
    }

    if (user.status === 'PENDING') {
      await this.events.record({ type: 'LOGIN_FAIL', userId: user.id, ...ctx, metadata: { reason: 'ACCOUNT_PENDING', method: 'GOOGLE' } });
      return this.pendingActivation(user, input, now);
    }

    if (user.status !== 'ACTIVE') return fail('USER_DISABLED', user.id);
    if (isLocked(user, now)) {
      await this.events.record({ type: 'LOGIN_BLOCKED', userId: user.id, ...ctx, metadata: { until: user.lockedUntil, method: 'GOOGLE' } });
      throw new InvalidCredentialsError();
    }

    if (!user.googleSub) {
      await this.users.linkGoogle(user.id, profile.sub);
      await this.events.record({ type: 'GOOGLE_LINKED', userId: user.id, ...ctx });
    }
    if (user.failedAttempts > 0 || user.lockoutLevel > 0 || user.lockedUntil) {
      await this.users.saveLoginState(user.id, clearedState());
    }
    return this.login.openSession(user, input, now, 'GOOGLE');
  }

  /**
   * Cuenta sin activar: se registra (o se reconoce) el dispositivo de este equipo como PENDIENTE para que el administrador
   * apruebe cuenta y equipo juntos, y no haya que repetir el paso cuando el usuario vuelva a entrar.
   */
  private async pendingActivation(
    user: User, input: { deviceKey?: string; ip?: string; userAgent?: string }, now: Date,
  ): Promise<LoginResult> {
    const { device, deviceKey, created } = await this.login.ensureDevice(user, input, now);
    if (!created && device.status === 'PENDING') await this.devices.touch(device.id, input.ip, now);
    return { kind: 'ACCOUNT_PENDING', deviceKey };
  }
}
