import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { PrismaModule } from './shared/infrastructure/prisma/prisma.module';
import { AuthModule } from './modules/auth/auth.module';
import { FilesModule } from './modules/files/files.module';
import { ChatModule } from './modules/chat/chat.module';
import { UsersModule } from './modules/users/users.module';

// Un solo despliegue (monolito) con módulos aislados (monolito modular).
// Para agregar un módulo: crear carpeta en modules/, exportar SOLO su API pública.
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    EventEmitterModule.forRoot(),
    // Límite global provisional; los perfiles configurables por usuario/IP llegan en el módulo de red.
    ThrottlerModule.forRoot({
      throttlers: [{ ttl: 60_000, limit: 120 }],
      // Solo en pruebas automáticas: un DISABLE_THROTTLE olvidado en producción NO debe apagar el freno a la fuerza bruta.
      skipIf: () => process.env.NODE_ENV === 'test' && process.env.DISABLE_THROTTLE === 'true',
    }),
    PrismaModule,
    AuthModule,
    FilesModule,
    ChatModule,
    UsersModule,
    // RolesModule, GroupsModule, NotificationsModule, AuditModule → siguientes fases
  ],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
