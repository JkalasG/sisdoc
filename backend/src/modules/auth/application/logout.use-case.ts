import { Inject, Injectable } from '@nestjs/common';
import {
  CLOCK, Clock, SECURITY_EVENT_LOG, SecurityEventLog, SESSION_REPOSITORY, SessionRepository,
  TOKEN_SERVICE, TokenService,
} from './ports';

@Injectable()
export class LogoutUseCase {
  constructor(
    @Inject(SESSION_REPOSITORY) private readonly sessions: SessionRepository,
    @Inject(TOKEN_SERVICE) private readonly tokens: TokenService,
    @Inject(SECURITY_EVENT_LOG) private readonly events: SecurityEventLog,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  /** Cierra la sesión a la que pertenece el refresh token. Idempotente: un token desconocido no falla. */
  async execute(input: { refreshToken?: string; ip?: string; userAgent?: string }): Promise<void> {
    if (!input.refreshToken) return;
    const session = await this.sessions.findByRefreshHash(this.tokens.hashToken(input.refreshToken));
    if (!session || session.revokedAt) return;
    const now = this.clock.now();
    await this.sessions.revoke(session.id, 'LOGOUT', now);
    await this.events.record({ type: 'LOGOUT', userId: session.userId, sessionId: session.id, ip: input.ip, userAgent: input.userAgent });
  }

  async executeAll(input: { userId: string; ip?: string; userAgent?: string }): Promise<void> {
    await this.sessions.revokeAllForUser(input.userId, 'LOGOUT_ALL', this.clock.now());
    await this.events.record({ type: 'LOGOUT_ALL', userId: input.userId, ip: input.ip, userAgent: input.userAgent });
  }
}
