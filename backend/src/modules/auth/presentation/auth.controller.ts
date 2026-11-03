import { Body, Controller, Get, HttpCode, Post, Req, Res, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';
import { Request, Response } from 'express';
import { clientIp } from '../../../shared/presentation/client-ip';
import { AuthUser, CurrentUser } from '../../../shared/presentation/current-user.decorator';
import { ChangePasswordUseCase } from '../application/change-password.use-case';
import { GetCurrentUserUseCase } from '../application/get-current-user.use-case';
import { LoginUseCase } from '../application/login.use-case';
import { LogoutUseCase } from '../application/logout.use-case';
import { RefreshSessionUseCase } from '../application/refresh-session.use-case';
import { UnauthenticatedError } from '../domain/auth-errors';
import { AuthCookies } from './auth-cookies';
import { AllowWhenPasswordChangePending, JwtCookieGuard } from './jwt-cookie.guard';

class LoginDto {
  @IsEmail() @MaxLength(254) email: string;
  @IsString() @MinLength(1) @MaxLength(128) password: string;
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
    private readonly refresh: RefreshSessionUseCase,
    private readonly logout: LogoutUseCase,
    private readonly changePassword: ChangePasswordUseCase,
    private readonly me: GetCurrentUserUseCase,
    private readonly cookies: AuthCookies,
  ) {}

  @Post('login')
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async doLogin(@Body() dto: LoginDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const result = await this.login.execute({
      email: dto.email, password: dto.password, deviceKey: this.cookies.readDevice(req), ...meta(req),
    });
    this.cookies.setDevice(res, result.deviceKey);

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
      this.cookies.clearSession(res);
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
