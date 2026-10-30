# 🧱 04 - Guía Paso a Paso: Cómo Construir un Módulo Nuevo desde Cero

Una de las mejores formas de dominar una arquitectura es aprender el **orden exacto en que se construyen los archivos** cuando te piden una funcionalidad nueva.

En un proyecto tradicional la gente empieza creando la tabla en la base de datos y el controlador HTTP. **En Arquitectura Limpia y Hexagonal empezamos de adentro hacia afuera** (primero el negocio, al final la base de datos y el controlador).

Imaginemos que te piden crear un nuevo módulo llamado **`notifications`** (para que los usuarios reciban notificaciones cuando alguien les comparte un documento o les envía un mensaje y puedan marcarlas como leídas).

---

## 🗺️ Estructura de Carpetas que Crearemos

```text
src/modules/notifications/
├── domain/
│   └── notification.ts                  # Paso 1: Entidades y reglas puras
├── application/
│   ├── ports.ts                         # Paso 2: Puertos (Symbol + interfaces)
│   ├── mark-notification-read.use-case.ts # Paso 3: Caso de Uso
│   └── mark-notification-read.spec.ts   # Paso 4: Test unitario en memoria
├── infrastructure/
│   └── prisma-notification.repository.ts # Paso 5: Adaptador Prisma
├── presentation/
│   └── notifications.controller.ts      # Paso 6: Controlador REST
├── notifications.module.ts              # Paso 7: Ensamblaje de DI
└── notifications.public-api.ts          # Paso 8: Contrato público del módulo
```

---

## Paso 1: Diseñar el Dominio (`domain/notification.ts`)

**Regla mental:** *"No existe NestJS, no existe Prisma, no existe HTTP. Solo existe TypeScript puro y las reglas del negocio."*

```typescript
// src/modules/notifications/domain/notification.ts
import { ForbiddenError, NotFoundError } from '../../../shared/domain/domain-error';

export type NotificationType = 'DOCUMENT_SHARED' | 'REVIEW_REQUESTED' | 'CHAT_MESSAGE';

export interface Notification {
  id: string;
  recipientId: string;
  type: NotificationType;
  title: string;
  readAt: Date | null;
  createdAt: Date;
}

/**
 * Regla "lo ajeno no existe": un usuario jamás puede saber si existe
 * una notificación de otra persona.
 */
export function assertNotificationOwner(
  notif: Notification | null,
  userId: string,
): asserts notif is Notification {
  if (!notif || notif.recipientId !== userId) {
    throw new NotFoundError('Notificación');
  }
}

export const isRead = (n: Notification): boolean => n.readAt !== null;
```
- **¿Por qué aquí?** Porque la regla *"nadie puede leer ni marcar notificaciones ajenas"* es una ley del negocio, no un detalle de SQL ni de Express.

---

## Paso 2: Definir los Puertos (`application/ports.ts`)

**Regla mental:** *"¿Qué necesita mi Caso de Uso del mundo exterior para poder trabajar?"*

```typescript
// src/modules/notifications/application/ports.ts
import { Notification, NotificationType } from '../domain/notification';

export const NOTIFICATION_REPOSITORY = Symbol('NOTIFICATION_REPOSITORY');

export interface NotificationRepository {
  create(input: {
    recipientId: string;
    type: NotificationType;
    title: string;
  }): Promise<Notification>;

  findById(id: string): Promise<Notification | null>;
  listUnreadByUser(userId: string): Promise<Notification[]>;
  markAsRead(id: string, at: Date): Promise<void>;
}
```

---

## Paso 3: Escribir el Caso de Uso (`application/mark-notification-read.use-case.ts`)

**Regla mental:** *"Orquesto los puertos y llamo a las funciones del dominio. Solo uso `@Injectable()` e `@Inject()`."*

```typescript
// src/modules/notifications/application/mark-notification-read.use-case.ts
import { Inject, Injectable } from '@nestjs/common';
import { assertNotificationOwner, isRead } from '../domain/notification';
import { NOTIFICATION_REPOSITORY, NotificationRepository } from './ports';

@Injectable()
export class MarkNotificationReadUseCase {
  constructor(
    @Inject(NOTIFICATION_REPOSITORY) private readonly repo: NotificationRepository,
  ) {}

  async execute(input: { notificationId: string; userId: string }): Promise<void> {
    const notif = await this.repo.findById(input.notificationId);
    assertNotificationOwner(notif, input.userId);

    // Idempotente: si ya estaba leída, no hace escritura innecesaria
    if (isRead(notif)) return;

    await this.repo.markAsRead(notif.id, new Date());
  }
}
```

---

## Paso 4: Probar el Caso de Uso en Memoria (`application/mark-notification-read.spec.ts`)

¡Observa que **aún no hemos escrito ni una sola línea de Prisma ni de SQL**, y ya podemos probar nuestro caso de uso al 100 %!

```typescript
// src/modules/notifications/application/mark-notification-read.spec.ts
import { NotFoundError } from '../../../shared/domain/domain-error';
import { Notification } from '../domain/notification';
import { MarkNotificationReadUseCase } from './mark-notification-read.use-case';
import { NotificationRepository } from './ports';

class InMemoryNotifications implements NotificationRepository {
  items: Notification[] = [];
  async create(i: { recipientId: string; type: Notification['type']; title: string }) {
    const n: Notification = { id: `n-${this.items.length + 1}`, ...i, readAt: null, createdAt: new Date() };
    this.items.push(n);
    return n;
  }
  async findById(id: string) { return this.items.find((n) => n.id === id) ?? null; }
  async listUnreadByUser(userId: string) { return this.items.filter((n) => n.recipientId === userId && !n.readAt); }
  async markAsRead(id: string, at: Date) {
    const item = this.items.find((n) => n.id === id);
    if (item) item.readAt = at;
  }
}

describe('MarkNotificationReadUseCase', () => {
  it('marca como leída una notificación propia', async () => {
    const repo = new InMemoryNotifications();
    const useCase = new MarkNotificationReadUseCase(repo);
    const created = await repo.create({ recipientId: 'user-1', type: 'CHAT_MESSAGE', title: 'Nuevo mensaje' });

    await useCase.execute({ notificationId: created.id, userId: 'user-1' });
    expect(created.readAt).toBeInstanceOf(Date);
  });

  it('lanza NotFoundError si otro usuario intenta marcarla', async () => {
    const repo = new InMemoryNotifications();
    const useCase = new MarkNotificationReadUseCase(repo);
    const created = await repo.create({ recipientId: 'user-1', type: 'CHAT_MESSAGE', title: 'Secreto' });

    await expect(useCase.execute({ notificationId: created.id, userId: 'intruso' }))
      .rejects.toBeInstanceOf(NotFoundError);
  });
});
```

---

## Paso 5: Crear el Adaptador de Infraestructura (`infrastructure/prisma-notification.repository.ts`)

Ahora sí, conectamos con PostgreSQL usando `PrismaService`. Recuerda: **solo en `infrastructure/`** podemos importar `PrismaService` o `@prisma/client`.

```typescript
// src/modules/notifications/infrastructure/prisma-notification.repository.ts
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../shared/infrastructure/prisma/prisma.service';
import { NotificationRepository } from '../application/ports';
import { Notification } from '../domain/notification';

@Injectable()
export class PrismaNotificationRepository implements NotificationRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(input: Parameters<NotificationRepository['create']>[0]): Promise<Notification> {
    // Aquí llamarías a this.prisma.notification.create(...)
    throw new Error('Implementar tras agregar modelo Notification en schema.prisma');
  }
  // ... resto de métodos usando this.prisma
}
```

---

## Paso 6: Crear el Controlador HTTP (`presentation/notifications.controller.ts`)

**Regla mental:** *"Para proteger la ruta con `JwtCookieGuard`, debo importarlo desde `../../auth/auth.public-api`, NUNCA desde `../../auth/presentation/jwt-cookie.guard`."*

```typescript
// src/modules/notifications/presentation/notifications.controller.ts
import { Controller, HttpCode, Param, ParseUUIDPipe, Patch, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { AuthUser, CurrentUser } from '../../../shared/presentation/current-user.decorator';
import { JwtCookieGuard } from '../../auth/auth.public-api'; // ✅ Importa SOLO de public-api
import { MarkNotificationReadUseCase } from '../application/mark-notification-read.use-case';

@ApiTags('notifications')
@UseGuards(JwtCookieGuard)
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly markRead: MarkNotificationReadUseCase) {}

  @Patch(':id/read')
  @HttpCode(204)
  async markAsRead(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    await this.markRead.execute({ notificationId: id, userId: u.id });
  }
}
```

---

## Paso 7: Ensamblar el Módulo y su API Pública (`notifications.module.ts` y `notifications.public-api.ts`)

```typescript
// src/modules/notifications/notifications.module.ts
import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.public-api';
import { MarkNotificationReadUseCase } from './application/mark-notification-read.use-case';
import { NOTIFICATION_REPOSITORY } from './application/ports';
import { PrismaNotificationRepository } from './infrastructure/prisma-notification.repository';
import { NotificationsController } from './presentation/notifications.controller';

@Module({
  imports: [AuthModule],
  controllers: [NotificationsController],
  providers: [
    MarkNotificationReadUseCase,
    { provide: NOTIFICATION_REPOSITORY, useClass: PrismaNotificationRepository },
  ],
  exports: [], // Solo exporta lo que otros módulos necesiten consumir
})
export class NotificationsModule {}
```

```typescript
// src/modules/notifications/notifications.public-api.ts
export { NotificationsModule } from './notifications.module';
```

---

## ✅ Checklist de Verificación antes de hacer Commit

Cada vez que crees o modifiques un archivo en `backend/`, hazte estas 5 preguntas y corre `npx jest src/architecture.spec.ts`:

1. **¿Estoy en `domain/`?** → ¿Importé sin querer algo de `@nestjs/*`, `@prisma/client` o de otra capa? Si sí, quítalo.
2. **¿Estoy en `application/`?** → ¿Importé `PrismaService`, `argon2`, `Request`/`Response` de Express o algo de `infrastructure/`? Si sí, cámbialo por un Puerto (`Symbol` + `interface`) en `ports.ts`.
3. **¿Necesito algo de otro módulo (ej. `auth` o `files`)?** → ¿Lo importé desde `../otro-modulo/otro-modulo.public-api`? Jamás importes directo de sus subcarpetas.
4. **¿Lancé una excepción en `domain/` o `application/`?** → Usa `DomainError` (`NotFoundError`, `ForbiddenError`, `ValidationError`), nunca `HttpException` de NestJS.
5. **¿Pasa `npm test`?** → Ejecuta siempre `npm test` para confirmar que `architecture.spec.ts` sigue en verde.

