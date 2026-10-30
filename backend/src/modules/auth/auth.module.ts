import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AuthenticateRequestUseCase } from './application/authenticate-request.use-case';
import { ChangePasswordUseCase } from './application/change-password.use-case';
import { GetCurrentUserUseCase } from './application/get-current-user.use-case';
import { LoginUseCase } from './application/login.use-case';
import { LogoutUseCase } from './application/logout.use-case';
import {
  CLOCK, DEVICE_REPOSITORY, PASSWORD_HASHER, SECURITY_EVENT_LOG, SESSION_REPOSITORY,
  TOKEN_SERVICE, USER_REPOSITORY,
} from './application/ports';
import { RefreshSessionUseCase } from './application/refresh-session.use-case';
import { Argon2PasswordHasher } from './infrastructure/argon2-password-hasher';
import { JwtTokenService } from './infrastructure/jwt-token-service';
import { PrismaDeviceRepository } from './infrastructure/prisma-device.repository';
import { PrismaSecurityEventLog } from './infrastructure/prisma-security-event.log';
import { PrismaSessionRepository } from './infrastructure/prisma-session.repository';
import { PrismaUserRepository } from './infrastructure/prisma-user.repository';
import { SystemClock } from './infrastructure/system-clock';
import { AuthCookies } from './presentation/auth-cookies';
import { AuthController } from './presentation/auth.controller';
import { JwtCookieGuard } from './presentation/jwt-cookie.guard';

@Module({
  imports: [JwtModule.register({})],
  controllers: [AuthController],
  providers: [
    LoginUseCase, RefreshSessionUseCase, LogoutUseCase, ChangePasswordUseCase,
    AuthenticateRequestUseCase, GetCurrentUserUseCase,
    AuthCookies, JwtCookieGuard,
    // puertos → adaptadores
    { provide: USER_REPOSITORY, useClass: PrismaUserRepository },
    { provide: SESSION_REPOSITORY, useClass: PrismaSessionRepository },
    { provide: DEVICE_REPOSITORY, useClass: PrismaDeviceRepository },
    { provide: PASSWORD_HASHER, useClass: Argon2PasswordHasher },
    { provide: TOKEN_SERVICE, useClass: JwtTokenService },
    { provide: SECURITY_EVENT_LOG, useClass: PrismaSecurityEventLog },
    { provide: CLOCK, useClass: SystemClock },
  ],
  // Solo lo necesario para proteger rutas y sockets en otros módulos.
  exports: [JwtCookieGuard, AuthenticateRequestUseCase, AuthCookies],
})
export class AuthModule {}
