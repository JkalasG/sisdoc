import { CanActivate, ExecutionContext, Injectable, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthenticateRequestUseCase } from '../application/authenticate-request.use-case';
import { PasswordChangeRequiredError, UnauthenticatedError } from '../domain/auth-errors';
import { AuthCookies } from './auth-cookies';

const ALLOW_PENDING_PASSWORD_CHANGE = 'auth:allowPendingPasswordChange';

/** Marca rutas que un usuario con "debe cambiar contraseña" SÍ puede usar (cambiarla, ver /me, salir). */
export const AllowWhenPasswordChangePending = () => SetMetadata(ALLOW_PENDING_PASSWORD_CHANGE, true);

@Injectable()
export class JwtCookieGuard implements CanActivate {
  constructor(
    private readonly authenticate: AuthenticateRequestUseCase,
    private readonly cookies: AuthCookies,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest();
    const token = this.cookies.readAccess(req);
    if (!token) throw new UnauthenticatedError();

    const auth = await this.authenticate.execute({ accessToken: token });
    const allowed = this.reflector.getAllAndOverride<boolean>(ALLOW_PENDING_PASSWORD_CHANGE, [
      ctx.getHandler(), ctx.getClass(),
    ]);
    if (auth.mustChangePassword && !allowed) throw new PasswordChangeRequiredError();

    req.user = { id: auth.userId, sessionId: auth.sessionId, deviceId: auth.deviceId };
    return true;
  }
}
