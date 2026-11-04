import { Body, Controller, Get, HttpCode, Inject, Post, Req, Res, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { IsEmail, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';
import { Request, Response } from 'express';
import { clientIp } from '../../../shared/presentation/client-ip';
import { AuthUser, CurrentUser } from '../../../shared/presentation/current-user.decorator';
import { ChangePasswordUseCase } from '../application/change-password.use-case';
import { GetCurrentUserUseCase } from '../application/get-current-user.use-case';
import { ConfirmPasswordResetUseCase } from '../application/confirm-password-reset.use-case';
import { RequestPasswordResetUseCase } from '../application/request-password-reset.use-case';
import { LoginWithGoogleUseCase } from '../application/login-google.use-case';
import { LoginResult, LoginUseCase } from '../application/login.use-case';
import { AUTH_PUBLIC_CONFIG, AuthPublicConfig } from '../application/ports';
import { LogoutUseCase } from '../application/logout.use-case';
import { RefreshSessionUseCase } from '../application/refresh-session.use-case';
import { AccountPendingActivationError, RefreshRaceError, UnauthenticatedError } from '../domain/auth-errors';
import { AuthCookies } from './auth-cookies';
import { AllowWhenPasswordChangePending, JwtCookieGuard } from './jwt-cookie.guard';

class LoginDto {
  @IsEmail() @MaxLength(254) email: string;
  @IsString() @MinLength(1) @MaxLength(128) password: string;
  @IsOptional() @IsString() @MaxLength(2048) captchaToken?: string;
}
class RequestResetDto {
  @IsEmail() @MaxLength(254) email: string;
  @IsOptional() @IsString() @MaxLength(2048) captchaToken?: string;
}
class ConfirmResetDto {
  @IsEmail() @MaxLength(254) email: string;
  @IsString() @Matches(/^\d{6}$/, { message: 'El código son 6 dígitos' }) code: string;
  @IsString() @MinLength(1) @MaxLength(128) newPassword: string;
}
class GoogleLoginDto {
  @IsString() @MinLength(20) @MaxLength(4096) idToken: string;
}
class ChangePasswordDto {
  @IsString() @MinLength(1) @MaxLength(128) currentPassword: string;
  @IsString() @MinLength(1) @MaxLength(128) newPassword: string;
}

const meta = (req: Request) => ({ ip: clientIp(req), userAgent: req.headers['user-agent'] });

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly login: LoginUseCase,
    private readonly loginGoogle: LoginWithGoogleUseCase,
    private readonly requestReset: RequestPasswordResetUseCase,
    private readonly confirmReset: ConfirmPasswordResetUseCase,
    @Inject(AUTH_PUBLIC_CONFIG) private readonly publicConfig: AuthPublicConfig,
    private readonly refresh: RefreshSessionUseCase,
    private readonly logout: LogoutUseCase,
    private readonly changePassword: ChangePasswordUseCase,
    private readonly me: GetCurrentUserUseCase,
    private readonly cookies: AuthCookies,
  ) {}

  /** Pública: indica al login qué opciones mostrar. La decisión real de exigirlas la toma siempre el servidor. */
  @Get('config')
  getConfig() {
    return this.publicConfig;
  }

  @Post('login')
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async doLogin(@Body() dto: LoginDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const result = await this.login.execute({
      email: dto.email, password: dto.password, captchaToken: dto.captchaToken,
      deviceKey: this.cookies.readDevice(req), ...meta(req),
    });
    return this.respond(result, res);
  }

  @Post('google')
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async doGoogleLogin(@Body() dto: GoogleLoginDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const result = await this.loginGoogle.execute({
      idToken: dto.idToken, deviceKey: this.cookies.readDevice(req), ...meta(req),
    });
    return this.respond(result, res);
  }

  /** Misma respuesta (202) exista o no el correo: no sirve para averiguar qué cuentas hay. */
  @Post('password-reset/request')
  @HttpCode(202)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  async doRequestReset(@Body() dto: RequestResetDto, @Req() req: Request) {
    await this.requestReset.execute({ email: dto.email, captchaToken: dto.captchaToken, ...meta(req) });
    return { status: 'ACCEPTED', message: 'Si el correo está registrado, te enviamos un código de verificación.' };
  }

  @Post('password-reset/confirm')
  @HttpCode(204)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async doConfirmReset(@Body() dto: ConfirmResetDto, @Req() req: Request) {
    await this.confirmReset.execute({ email: dto.email, code: dto.code, newPassword: dto.newPassword, ...meta(req) });
  }

  /** Respuesta común del login con contraseña y con Google. */
  private respond(result: LoginResult, res: Response) {
    // La cookie del equipo se entrega SIEMPRE: así, cuando el administrador lo apruebe, este mismo navegador ya es reconocido.
    this.cookies.setDevice(res, result.deviceKey);

    if (result.kind === 'ACCOUNT_PENDING') {
      const e = new AccountPendingActivationError();
      res.status(403);
      return { code: e.code, message: e.message };
    }
    if (result.kind === 'DEVICE_PENDING') {
      res.status(202);
      return {
        status: 'DEVICE_PENDING',
        message: 'Dispositivo pendiente de autorización. Un administrador debe aprobarlo.',
      };
    }
    this.cookies.setSession(res, result);
    return { status: 'OK', user: result.user, sessionExpiresAt: result.sessionExpiresAt };
  }

  @Post('refresh')
  @HttpCode(200)
  async doRefresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const token = this.cookies.readRefresh(req);
    if (!token) throw new UnauthenticatedError();
    try {
      const r = await this.refresh.execute({ refreshToken: token, ...meta(req) });
      this.cookies.setSession(res, r);
      return { status: 'OK', sessionExpiresAt: r.sessionExpiresAt };
    } catch (e) {
      // En la carrera entre pestañas la otra ya dejó cookies válidas: borrarlas cerraría la sesión.
      if (!(e instanceof RefreshRaceError)) this.cookies.clearSession(res);
      throw e;
    }
  }

  @Post('logout')
  @HttpCode(204)
  async doLogout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    await this.logout.execute({ refreshToken: this.cookies.readRefresh(req), ...meta(req) });
    this.cookies.clearSession(res);
  }

  @Post('logout-all')
  @HttpCode(204)
  @UseGuards(JwtCookieGuard)
  @AllowWhenPasswordChangePending()
  async doLogoutAll(@CurrentUser() u: AuthUser, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    await this.logout.executeAll({ userId: u.id, ...meta(req) });
    this.cookies.clearSession(res);
  }

  @Post('change-password')
  @HttpCode(204)
  @UseGuards(JwtCookieGuard)
  @AllowWhenPasswordChangePending()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  async doChangePassword(@CurrentUser() u: AuthUser, @Body() dto: ChangePasswordDto, @Req() req: Request) {
    await this.changePassword.execute({
      userId: u.id, sessionId: u.sessionId!, currentPassword: dto.currentPassword, newPassword: dto.newPassword, ...meta(req),
    });
  }

  @Get('me')
  @UseGuards(JwtCookieGuard)
  @AllowWhenPasswordChangePending()
  getMe(@CurrentUser() u: AuthUser) {
    return this.me.execute(u.id);
  }
}
