import { Inject, Injectable } from '@nestjs/common';
import { RefreshRaceError, UnauthenticatedError } from '../domain/auth-errors';
import { isSessionActive, SESSION_POLICY } from '../domain/session';
import {
  CLOCK, Clock, SECURITY_EVENT_LOG, SecurityEventLog, SESSION_REPOSITORY, SessionRepository,
  TOKEN_SERVICE, TokenService,
} from './ports';

@Injectable()
export class RefreshSessionUseCase {
  constructor(
    @Inject(SESSION_REPOSITORY) private readonly sessions: SessionRepository,
    @Inject(TOKEN_SERVICE) private readonly tokens: TokenService,
    @Inject(SECURITY_EVENT_LOG) private readonly events: SecurityEventLog,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(input: { refreshToken: string; ip?: string; userAgent?: string }) {
    const now = this.clock.now();
    const ctx = { ip: input.ip, userAgent: input.userAgent };
    const hash = this.tokens.hashToken(input.refreshToken);

    const current = await this.sessions.findByRefreshHash(hash);
    if (!current) {
      // ¿Es un refresh YA usado (fuera de la ventana de gracia)? Entonces alguien lo copió: se revoca toda la sesión.
      const reused = await this.sessions.findByPrevRefreshHash(hash);
      if (reused && !reused.revokedAt) {
        // Dos pestañas refrescan a la vez: la perdedora llega con el token que la otra acaba de rotar.
        if (reused.rotatedAt && now.getTime() - reused.rotatedAt.getTime() < SESSION_POLICY.rotationGraceMs) {
          throw new RefreshRaceError();
        }
        await this.sessions.revoke(reused.id, 'ROTATION_REUSE', now);
        await this.events.record({ type: 'REFRESH_REUSE', userId: reused.userId, sessionId: reused.id, deviceId: reused.deviceId, ...ctx });
      }
      throw new UnauthenticatedError();
    }

    if (!isSessionActive(current, now)) throw new UnauthenticatedError();

    const owner = await this.sessions.findWithOwner(current.id);
    if (!owner || owner.user.status !== 'ACTIVE' || owner.device.status !== 'TRUSTED') {
      await this.sessions.revoke(current.id, owner?.user.status !== 'ACTIVE' ? 'USER_DISABLED' : 'DEVICE_BLOCKED', now);
      throw new UnauthenticatedError();
    }

    const refreshToken = this.tokens.generateOpaqueToken();
    const rotated = await this.sessions.rotate(current.id, {
      oldHash: hash, newHash: this.tokens.hashToken(refreshToken), at: now,
    });
    if (!rotated) throw new UnauthenticatedError(); // otra petición ya rotó este token

    await this.events.record({ type: 'REFRESH_OK', userId: current.userId, sessionId: current.id, ...ctx });
    return {
      accessToken: this.tokens.signAccess({ userId: current.userId, sessionId: current.id }, SESSION_POLICY.accessTtlSeconds),
      refreshToken,
      sessionExpiresAt: current.absoluteExpiresAt,
    };
  }
}
