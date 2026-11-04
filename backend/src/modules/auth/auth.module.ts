import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MAILER, Mailer, MailModule } from '../mail/mail.public-api';
import { JwtModule } from '@nestjs/jwt';
import { AuthenticateRequestUseCase } from './application/authenticate-request.use-case';
import { ChangePasswordUseCase } from './application/change-password.use-case';
import { ConfirmPasswordResetUseCase } from './application/confirm-password-reset.use-case';
import { GetCurrentUserUseCase } from './application/get-current-user.use-case';
import { LoginWithGoogleUseCase } from './application/login-google.use-case';
import { LoginUseCase } from './application/login.use-case';
import { LogoutUseCase } from './application/logout.use-case';
import { ManageDevicesUseCase } from './application/manage-devices.use-case';
import {
  ADMIN_DEVICE_REPOSITORY, AUTH_PUBLIC_CONFIG, AuthPublicConfig, CAPTCHA_VERIFIER, CLOCK, DEVICE_REPOSITORY, GOOGLE_IDENTITY, PASSWORD_HASHER, SECURITY_EVENT_LOG, SESSION_REPOSITORY,
  OTP_SERVICE, PASSWORD_RESET_REPOSITORY, TOKEN_SERVICE, USER_REPOSITORY,
} from './application/ports';
import { RefreshSessionUseCase } from './application/refresh-session.use-case';
import { RequestPasswordResetUseCase } from './application/request-password-reset.use-case';
import { Argon2PasswordHasher } from './infrastructure/argon2-password-hasher';
import { flag } from './infrastructure/auth-flags';
import { GoogleIdTokenVerifier } from './infrastructure/google-id-token.verifier';
import { HmacOtpService } from './infrastructure/hmac-otp.service';
import { JwtTokenService } from './infrastructure/jwt-token-service';
import { PrismaAdminDeviceRepository } from './infrastructure/prisma-admin-device.repository';
import { PrismaDeviceRepository } from './infrastructure/prisma-device.repository';
import { PrismaPasswordResetRepository } from './infrastructure/prisma-password-reset.repository';
import { PrismaSecurityEventLog } from './infrastructure/prisma-security-event.log';
import { PrismaSessionRepository } from './infrastructure/prisma-session.repository';
import { PrismaUserRepository } from './infrastructure/prisma-user.repository';
import { SystemClock } from './infrastructure/system-clock';
import { TurnstileCaptchaVerifier } from './infrastructure/turnstile-captcha.verifier';
import { AuthCookies } from './presentation/auth-cookies';
import { AdminDevicesController } from './presentation/admin-devices.controller';
import { AuthController } from './presentation/auth.controller';
import { JwtCookieGuard } from './presentation/jwt-cookie.guard';

@Module({
  imports: [JwtModule.register({}), MailModule],
  controllers: [AuthController, AdminDevicesController],
  providers: [
    LoginUseCase, LoginWithGoogleUseCase, RefreshSessionUseCase, RequestPasswordResetUseCase, ConfirmPasswordResetUseCase, LogoutUseCase, ChangePasswordUseCase,
    AuthenticateRequestUseCase, GetCurrentUserUseCase, ManageDevicesUseCase,
    AuthCookies, JwtCookieGuard,
    // puertos → adaptadores
    { provide: USER_REPOSITORY, useClass: PrismaUserRepository },
    { provide: SESSION_REPOSITORY, useClass: PrismaSessionRepository },
    { provide: DEVICE_REPOSITORY, useClass: PrismaDeviceRepository },
    { provide: ADMIN_DEVICE_REPOSITORY, useClass: PrismaAdminDeviceRepository },
    { provide: PASSWORD_HASHER, useClass: Argon2PasswordHasher },
    { provide: TOKEN_SERVICE, useClass: JwtTokenService },
    { provide: SECURITY_EVENT_LOG, useClass: PrismaSecurityEventLog },
    { provide: CLOCK, useClass: SystemClock },
    { provide: PASSWORD_RESET_REPOSITORY, useClass: PrismaPasswordResetRepository },
    { provide: OTP_SERVICE, useClass: HmacOtpService },
    { provide: CAPTCHA_VERIFIER, useClass: TurnstileCaptchaVerifier },
    { provide: GOOGLE_IDENTITY, useClass: GoogleIdTokenVerifier },
    {
      // Lo único que se publica al navegador: si cada opción está activa y su clave PÚBLICA. Nunca secretos.
      provide: AUTH_PUBLIC_CONFIG,
      inject: [ConfigService, MAILER],
      useFactory: (c: ConfigService, mailer: Mailer): AuthPublicConfig => {
        const captcha = flag(c, 'CAPTCHA_ENABLED');
        const google = flag(c, 'GOOGLE_LOGIN_ENABLED');
        const siteKey = String(c.get('TURNSTILE_SITE_KEY', '')).trim();
        const clientId = String(c.get('GOOGLE_CLIENT_ID', '')).trim();
        if (captcha && !siteKey) throw new Error('CAPTCHA_ENABLED=true exige TURNSTILE_SITE_KEY');
        return {
          captcha: { enabled: captcha, siteKey: captcha ? siteKey : null },
          google: { enabled: google, clientId: google ? clientId : null },
          passwordReset: { enabled: mailer.enabled }, // recuperar la contraseña exige poder enviar correos
        };
      },
    },
  ],
  // Solo lo necesario para proteger rutas y sockets en otros módulos.
  exports: [JwtCookieGuard, AuthenticateRequestUseCase, AuthCookies, PASSWORD_HASHER],
})
export class AuthModule {}
