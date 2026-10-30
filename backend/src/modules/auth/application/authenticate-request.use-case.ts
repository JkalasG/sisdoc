import { Inject, Injectable } from '@nestjs/common';
import { UnauthenticatedError } from '../domain/auth-errors';
import { isSessionActive, shouldTouch } from '../domain/session';
import { CLOCK, Clock, SESSION_REPOSITORY, SessionRepository, TOKEN_SERVICE, TokenService } from './ports';

export interface AuthContext {
  userId: string;
  sessionId: string;
  deviceId: string;
  mustChangePassword: boolean;
}

/** Se ejecuta en CADA petición protegida: una sola consulta a la base de datos. */
@Injectable()
export class AuthenticateRequestUseCase {
  constructor(
    @Inject(SESSION_REPOSITORY) private readonly sessions: SessionRepository,
    @Inject(TOKEN_SERVICE) private readonly tokens: TokenService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(input: { accessToken: string }): Promise<AuthContext> {
    const claims = this.tokens.verifyAccess(input.accessToken);
    if (!claims) throw new UnauthenticatedError();

    const found = await this.sessions.findWithOwner(claims.sessionId);
    const now = this.clock.now();
    if (
      !found || found.session.userId !== claims.userId || !isSessionActive(found.session, now) ||
      found.user.status !== 'ACTIVE' || found.device.status !== 'TRUSTED'
    ) {
      throw new UnauthenticatedError();
    }

    if (shouldTouch(found.session, now)) await this.sessions.touch(found.session.id, now);

    return {
      userId: found.user.id,
      sessionId: found.session.id,
      deviceId: found.device.id,
      mustChangePassword: found.user.mustChangePassword,
    };
  }
}
