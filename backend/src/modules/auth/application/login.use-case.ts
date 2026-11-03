import { Inject, Injectable } from '@nestjs/common';
import {
  DeviceBlockedError, InvalidCredentialsError, SessionLimitReachedError,
} from '../domain/auth-errors';
import { describeUserAgent } from '../domain/device';
import { clearedState, isLocked, registerFailure } from '../domain/lockout-policy';
import { inactiveBefore, SESSION_POLICY, sessionExpiry } from '../domain/session';
import { normalizeEmail } from '../domain/user';
import {
  CLOCK, Clock, DEVICE_REPOSITORY, DeviceRepository, PASSWORD_HASHER, PasswordHasher,
  SECURITY_EVENT_LOG, SecurityEventLog, SESSION_REPOSITORY, SessionRepository,
  TOKEN_SERVICE, TokenService, USER_REPOSITORY, UserRepository,
} from './ports';

export interface LoginInput {
  email: string;
  password: string;
  deviceKey?: string; // identificador guardado en el equipo (cookie)
  ip?: string;
  userAgent?: string;
}

export type LoginResult =
  | {
      kind: 'AUTHENTICATED';
      accessToken: string;
      refreshToken: string;
      deviceKey: string;
      sessionExpiresAt: Date;
      user: { id: string; email: string; displayName: string; mustChangePassword: boolean; roles: string[] };
    }
  | { kind: 'DEVICE_PENDING'; deviceKey: string };

@Injectable()
export class LoginUseCase {
  constructor(
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    @Inject(SESSION_REPOSITORY) private readonly sessions: SessionRepository,
    @Inject(DEVICE_REPOSITORY) private readonly devices: DeviceRepository,
    @Inject(PASSWORD_HASHER) private readonly hasher: PasswordHasher,
    @Inject(TOKEN_SERVICE) private readonly tokens: TokenService,
    @Inject(SECURITY_EVENT_LOG) private readonly events: SecurityEventLog,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(input: LoginInput): Promise<LoginResult> {
    const now = this.clock.now();
    const email = normalizeEmail(input.email);
    const ctx = { ip: input.ip, userAgent: input.userAgent };

    const user = await this.users.findByEmail(email);

    // Siempre se gasta el mismo trabajo de hash, exista o no el usuario.
    let passwordOk = false;
    if (user?.passwordHash) passwordOk = await this.hasher.verify(user.passwordHash, input.password);
    else await this.hasher.verifyDummy(input.password);

    if (!user) {
      await this.events.record({ type: 'LOGIN_FAIL', ...ctx, metadata: { reason: 'UNKNOWN_EMAIL', email: email.slice(0, 254) } });
      throw new InvalidCredentialsError();
    }
    if (user.status !== 'ACTIVE') {
      await this.events.record({ type: 'LOGIN_FAIL', userId: user.id, ...ctx, metadata: { reason: 'USER_DISABLED' } });
      throw new InvalidCredentialsError();
    }
    if (isLocked(user, now)) {
      await this.events.record({ type: 'LOGIN_BLOCKED', userId: user.id, ...ctx, metadata: { until: user.lockedUntil } });
      throw new InvalidCredentialsError();
    }
    if (!passwordOk) {
      const state = registerFailure(user, now);
      await this.users.saveLoginState(user.id, state);
      await this.events.record({ type: 'LOGIN_FAIL', userId: user.id, ...ctx, metadata: { reason: 'BAD_PASSWORD' } });
      if (state.lockedUntil) {
        await this.events.record({ type: 'ACCOUNT_LOCKED', userId: user.id, ...ctx, metadata: { until: state.lockedUntil, level: state.lockoutLevel } });
      }
      throw new InvalidCredentialsError();
    }

    // Credenciales correctas → se limpia el contador de fallos.
    if (user.failedAttempts > 0 || user.lockoutLevel > 0 || user.lockedUntil) {
      await this.users.saveLoginState(user.id, clearedState());
    }

    // Dispositivo: un equipo nuevo NO obtiene sesión hasta que un admin lo apruebe.
    const deviceKey = input.deviceKey ?? this.tokens.generateOpaqueToken();
    const keyHash = this.tokens.hashToken(deviceKey);
    const device = await this.devices.findByKeyHash(user.id, keyHash);

    if (!device) {
      const created = await this.devices.create({
        userId: user.id, keyHash, label: describeUserAgent(input.userAgent), ...ctx, now,
      });
      await this.events.record({ type: 'DEVICE_NEW', userId: user.id, deviceId: created.id, ...ctx, metadata: { label: created.label } });
      return { kind: 'DEVICE_PENDING', deviceKey };
    }
    if (device.status === 'PENDING') {
      await this.devices.touch(device.id, input.ip, now);
      await this.events.record({ type: 'DEVICE_PENDING_ATTEMPT', userId: user.id, deviceId: device.id, ...ctx });
      return { kind: 'DEVICE_PENDING', deviceKey };
    }
    if (device.status === 'BLOCKED') {
      await this.events.record({ type: 'DEVICE_BLOCKED_ATTEMPT', userId: user.id, deviceId: device.id, ...ctx });
      throw new DeviceBlockedError();
    }

    // Máximo de sesiones simultáneas: la siguiente se rechaza.
    const live = await this.sessions.countLive(user.id, { now, inactiveBefore: inactiveBefore(now) });
    if (live >= SESSION_POLICY.maxLive) {
      await this.events.record({ type: 'LOGIN_SESSION_LIMIT', userId: user.id, deviceId: device.id, ...ctx });
      throw new SessionLimitReachedError(SESSION_POLICY.maxLive);
    }

    const refreshToken = this.tokens.generateOpaqueToken();
    const session = await this.sessions.create({
      userId: user.id, deviceId: device.id, refreshHash: this.tokens.hashToken(refreshToken),
      ...ctx, now, absoluteExpiresAt: sessionExpiry(now),
    });
    await this.devices.touch(device.id, input.ip, now);
    await this.users.saveLoginState(user.id, { ...clearedState(), lastLoginAt: now });
    await this.events.record({ type: 'LOGIN_OK', userId: user.id, deviceId: device.id, sessionId: session.id, ...ctx });

    return {
      kind: 'AUTHENTICATED',
      accessToken: this.tokens.signAccess({ userId: user.id, sessionId: session.id }, SESSION_POLICY.accessTtlSeconds),
      refreshToken,
      deviceKey,
      sessionExpiresAt: session.absoluteExpiresAt,
      user: { id: user.id, email: user.email, displayName: user.displayName, mustChangePassword: user.mustChangePassword, roles: user.roles ?? [] },
    };
  }
}
