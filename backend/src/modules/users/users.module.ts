import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthModule, PASSWORD_HASHER as AUTH_PASSWORD_HASHER } from '../auth/auth.public-api';
import { ManageUsersUseCase } from './application/manage-users.use-case';
import {
  ALLOWED_EMAIL_DOMAINS, CLOCK, PASSWORD_HASHER, SECURITY_EVENTS, TEMP_PASSWORD_GENERATOR, USER_ADMIN_REPOSITORY,
} from './application/ports';
import { PrismaSecurityEvents } from './infrastructure/prisma-security-events';
import { PrismaUserAdminRepository } from './infrastructure/prisma-user-admin.repository';
import { RandomPasswordGenerator } from './infrastructure/random-password.generator';
import { SystemClock } from './infrastructure/system-clock';
import { AdminUsersController } from './presentation/admin-users.controller';

@Module({
  imports: [AuthModule], // JwtCookieGuard y el hasher Argon2 (mismos parámetros que el login)
  controllers: [AdminUsersController],
  providers: [
    ManageUsersUseCase,
    { provide: USER_ADMIN_REPOSITORY, useClass: PrismaUserAdminRepository },
    { provide: PASSWORD_HASHER, useExisting: AUTH_PASSWORD_HASHER },
    { provide: TEMP_PASSWORD_GENERATOR, useClass: RandomPasswordGenerator },
    { provide: SECURITY_EVENTS, useClass: PrismaSecurityEvents },
    { provide: CLOCK, useClass: SystemClock },
    {
      // ALLOWED_EMAIL_DOMAINS="empresa.com,otra.com"; vacío = cualquier dominio.
      provide: ALLOWED_EMAIL_DOMAINS,
      inject: [ConfigService],
      useFactory: (c: ConfigService) =>
        String(c.get('ALLOWED_EMAIL_DOMAINS', '')).split(',').map((d) => d.trim().toLowerCase().replace(/^@/, '')).filter(Boolean),
    },
  ],
})
export class UsersModule {}
