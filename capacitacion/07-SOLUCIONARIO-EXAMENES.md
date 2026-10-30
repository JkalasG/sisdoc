# ✅ 07 - Solucionario Detallado de Exámenes y Retos Prácticos

¡Felicidades por completar el examen! Aquí tienes las respuestas correctas con su explicación técnica profunda y el código de solución para los escenarios y retos.

---

## 🥉 Solucionario Parte 1: Arquitectura Limpia y Hexagonal

| Pregunta | Respuesta Correcta | Explicación Arquitectónica |
| :---: | :---: | :--- |
| **1** | **B** | En TypeScript, las interfaces (`interface UserRepository`) son constructos exclusivos de tiempo de compilación y **se borran por completo** al transpilar a JavaScript. Como el contenedor de Inyección de Dependencias de NestJS funciona en tiempo de ejecución (Node.js), necesita un valor real como clave de búsqueda: por eso usamos `export const USER_REPOSITORY = Symbol('USER_REPOSITORY')` junto con `@Inject(USER_REPOSITORY)`. |
| **2** | **C** | `fs/promises` está en la lista `INFRA_LIBS` de `src/architecture.spec.ts` (línea 24). Un caso de uso en `application/` jamás debe tocar el sistema de archivos directamente; para eso pide el puerto `@Inject(FILE_STORAGE) private readonly storage: FileStorage`. |
| **3** | **B** | Es la regla de seguridad **"lo ajeno no existe"** (defensa contra IDOR / enumeración). Si devuelves `403 Forbidden` a alguien que no tiene ni permiso `VIEW`, le estás confirmando que ese UUID de documento existe en la base de datos. Al devolver `404 NotFoundError`, un documento privado de otro usuario es 100 % indistinguible de un UUID inventado (tal como se verifica en `test/files-isolation.e2e-spec.ts`, línea 60). |
| **4** | **C** | El módulo `chat` es autónomo: habla con su propio puerto `DOCUMENTS_PORT` (`chat/domain/ports.ts`). En `chat/infrastructure/files-documents.adapter.ts`, la clase `FilesDocumentsAdapter` actúa como **Capa Anticorrupción (ACL)**: implementa `DocumentsPort` e inyecta `DOCUMENTS_API` desde `../../files/files.public-api`. |
| **5** | **C** | En un Monolito Modular bien diseñado, las tablas de distintos módulos no se atan con Foreign Keys físicas en la base de datos. Así `chat` solo conoce IDs lógicos (`documentId`, `versionId`), valida la integridad mediante el puerto de aplicación y el día de mañana podrías mover la base de datos de `chat` a otro servidor sin romper migraciones de `files`. |
| **6** | **B** | Seguridad y auditoría *fail-closed*: si el `append` en `document_access_logs` falla (por ejemplo, error de disco o de BD), el `await` lanza excepción antes de llamar a `storage.read()`. Así es **imposible** que alguien descargue un documento sin que su descarga haya quedado grabada en la bitácora. |
| **7** | **B** | El tiempo (`new Date()`) es una dependencia externa impura. Al abstraerlo detrás del puerto `Clock`, en producción se inyecta `SystemClock` y en los tests unitarios se inyecta `FakeClock`, permitiendo avanzar 15 minutos, 30 minutos o 12 horas en 0 ms con `w.clock.advance(...)`. |
| **8** | **B** | Esa es la magia de Puertos y Adaptadores: el puerto `FileStorage` (`put` y `read`) no cambia. Creas `S3FileStorage` en `files/infrastructure/` y cambias una sola línea en `files.module.ts`. `UploadDocumentUseCase` y `DownloadDocumentUseCase` no sufren ni un solo cambio. |
| **9** | **B** | En `PrismaDocumentRepository` (`src/modules/files/infrastructure/prisma-document.repository.ts`, líneas 9-19). Las funciones `toDoc` y `toVersion` son *Mappers* de infraestructura que limpian los tipos de Prisma (`BigInt`, `deletedAt: Date | null`) antes de entregarlos al dominio. |
| **10** | **B** | En `RefreshSessionUseCase` (líneas 23-32), si el hash del refresh token no coincide con `refreshHash`, se busca en `prevRefreshHash`. Al encontrarlo ahí, el sistema sabe con certeza que el token fue clonado/reutilizado, revoca la sesión completa con motivo `'ROTATION_REUSE'` y registra el evento de seguridad `REFRESH_REUSE`. |

---

## 🥈 Solucionario Parte 2: Dominio de NestJS y Seguridad

| Pregunta | Respuesta Correcta | Explicación Técnica en NestJS |
| :---: | :---: | :--- |
| **11** | **C** | `AllowWhenPasswordChangePending` usa `SetMetadata('auth:allowPendingPasswordChange', true)`. Luego `JwtCookieGuard` usa `this.reflector.getAllAndOverride(...)` para leer ese metadato en el método o controlador actual. Si el usuario tiene `mustChangePassword: true` y la ruta no tiene el metadato, lanza `PasswordChangeRequiredError` (403). |
| **12** | **C** | `DomainErrorFilter` (`src/shared/presentation/domain-error.filter.ts`) está registrado globalmente en `app.setup.ts` con `app.useGlobalFilters(new DomainErrorFilter())`. Captura cualquier instancia de `DomainError`, busca `err.code` (`'SESSION_LIMIT'`) en su mapa `STATUS` y responde HTTP `409 Conflict`. |
| **13** | **B** | `whitelist: true` filtra propiedades desconocidas; `forbidNonWhitelisted: true` rechaza con `400 Bad Request` si el cliente envía cualquier campo extra (como `isAdmin: true`), y `transform: true` convierte el payload plano en instancia de la clase DTO. |
| **14** | **B** | Sin `{ passthrough: true }`, inyectar `@Res()` activa el "modo manual de librería (Express)" en NestJS, deshabilitando interceptores, serialización del `return` y el `DomainErrorFilter` en esa ruta. Con `{ passthrough: true }`, tienes acceso a `res.cookie(...)` y `res.status(202)` pero NestJS sigue gestionando el ciclo de respuesta normalmente. |
| **15** | **B** | Restringir el `path` de `sisdoc_rt` a `/api/v1/auth` hace que el navegador solo adjunte esa cookie cuando la URL empieza por `/api/v1/auth` (`/login`, `/refresh`, `/logout`), reduciendo al mínimo la superficie de ataque del refresh token. |
| **16** | **C** | En `ChatGateway.handleConnection(client: Socket)`, se lee `client.handshake.headers.cookie` mediante `this.cookies.readAccessFromHeader(...)` y se invoca `this.authenticate.execute({ accessToken: token })`. Si lanza error o no hay token, ejecuta `client.disconnect(true)`. |
| **17** | **C** | Evita el ataque de enumeración por tiempo (*Timing Attack*). Tanto si el usuario existe como si no existe (o si solo usa Google y tiene `passwordHash: null`), el servidor ejecuta una verificación completa de Argon2id (`verify` o `verifyDummy`). |
| **18** | **B** | `pathOf(key)` previene *Path Traversal* asegurando que la ruta resuelta esté estrictamente dentro de `this.root + sep`. Y `{ flag: 'wx' }` le indica al sistema operativo que abra el archivo para escritura pero **falle con `EEXIST` si ya existe**, garantizando la inmutabilidad de las versiones en disco. |

---

## 🥇 Solucionario Parte 3: "Caza el Bug Arquitectónico"

### 🔍 Solución Escenario A (`src/modules/files/domain/document-validator.ts`)
- **Respuesta A1 (3 violaciones a `architecture.spec.ts`):**
  1. Importa `@nestjs/common` (`BadRequestException`) dentro de la capa `domain/` (violación de la regla 1: *el DOMINIO no depende de Nest*).
  2. Importa `prisma.service` dentro de `domain/` (violación de la regla 3: *Prisma solo se usa en infraestructura*).
  3. Importa desde `shared/infrastructure` fuera de la capa `infrastructure/` (violación de la regla 5).
- **Respuesta A2 (Cómo rediseñarlo bien):**
  1. En `files/domain/ports.ts`, agrega el método `existsByTitle(title: string): Promise<boolean>` a la interfaz `DocumentRepository`.
  2. Implementa `existsByTitle` con Prisma dentro de `files/infrastructure/prisma-document.repository.ts`.
  3. En el Caso de Uso (`UploadDocumentUseCase`), llama a `if (await this.docs.existsByTitle(input.title)) throw new ValidationError('El título ya existe');` (usando `ValidationError` de `shared/domain/domain-error.ts`, jamás `BadRequestException`).

---

### 🔍 Solución Escenario B (`src/modules/chat/application/delete-message.use-case.ts`)
- **Respuesta B1 (2 violaciones a `architecture.spec.ts`):**
  1. Un archivo en `application/` está importando un archivo de `infrastructure/` (`../../files/infrastructure/prisma-document.repository`), violando la regla 2.
  2. El módulo `chat` está importando un archivo interno del módulo `files` en lugar de importar únicamente `../../files/files.public-api`, violando la regla 4 (*fronteras entre módulos*).
- **Respuesta B2 (Por qué fallaría NestJS al arrancar):**
  - Porque `FilesModule` (`src/modules/files/files.module.ts`) **solo exporta `DOCUMENTS_API`** (`exports: [DOCUMENTS_API]`). `PrismaDocumentRepository` es un proveedor privado de `FilesModule`, por lo que el contenedor de Inyección de Dependencias de NestJS lanzaría `UnknownDependenciesException` al intentar resolver `DeleteMessageUseCase` en `ChatModule`.

---

### 🔍 Solución Escenario C (`ChatGateway.onJoin`) y Reto Práctico 2
- **Respuesta C1 (Riesgo de seguridad):**
  - Aunque el socket está autenticado (sabemos quién es `client.data.userId`), `onJoin` une el socket a la sala `conversation:${body.conversationId}` **sin comprobar si ese usuario es miembro de esa conversación**. Si un usuario autenticado conoce o adivina el UUID de una conversación ajena y emite `conversation:join`, empezaría a recibir en tiempo real los eventos `message:new` de esa conversación privada.
- **Respuesta C2 y Código del Reto Práctico 2:**

1. **Crear el Caso de Uso (`src/modules/chat/application/join-conversation.use-case.ts`):**
```typescript
import { Inject, Injectable } from '@nestjs/common';
import { ForbiddenError } from '../../../shared/domain/domain-error';
import { CONVERSATION_REPOSITORY, ConversationRepository } from '../domain/ports';

@Injectable()
export class JoinConversationUseCase {
  constructor(
    @Inject(CONVERSATION_REPOSITORY) private readonly conversations: ConversationRepository,
  ) {}

  async execute(input: { conversationId: string; userId: string }): Promise<void> {
    const members = await this.conversations.getMemberIds(input.conversationId);
    if (!members.includes(input.userId)) {
      throw new ForbiddenError('No perteneces a esta conversación');
    }
  }
}
```

2. **Usarlo en `ChatGateway` (`src/modules/chat/presentation/chat.gateway.ts`):**
```typescript
  @SubscribeMessage('conversation:join')
  async onJoin(@ConnectedSocket() client: Socket, @MessageBody() body: { conversationId: string }) {
    await this.joinConversation.execute({
      conversationId: body.conversationId,
      userId: client.data.userId,
    });
    client.join(`conversation:${body.conversationId}`);
  }
```

3. **Probarlo en Memoria (`src/modules/chat/application/join-conversation.use-case.spec.ts`):**
```typescript
import { ForbiddenError } from '../../../shared/domain/domain-error';
import { ConversationRepository } from '../domain/ports';
import { JoinConversationUseCase } from './join-conversation.use-case';

class FakeConversations implements ConversationRepository {
  constructor(private readonly map: Record<string, string[]> = {}) {}
  async getMemberIds(conversationId: string): Promise<string[]> {
    return this.map[conversationId] ?? [];
  }
}

describe('JoinConversationUseCase', () => {
  it('permite unirse si el usuario es miembro de la conversación', async () => {
    const uc = new JoinConversationUseCase(new FakeConversations({ 'conv-1': ['ana', 'luis'] }));
    await expect(uc.execute({ conversationId: 'conv-1', userId: 'ana' })).resolves.toBeUndefined();
  });

  it('lanza ForbiddenError si el usuario NO pertenece a la conversación', async () => {
    const uc = new JoinConversationUseCase(new FakeConversations({ 'conv-1': ['ana', 'luis'] }));
    await expect(uc.execute({ conversationId: 'conv-1', userId: 'intruso' }))
      .rejects.toBeInstanceOf(ForbiddenError);
  });
});
```

---

## 📊 Tabla de Autoevaluación

Cuenta tus aciertos de las 18 preguntas de opción múltiple + los 3 escenarios:

- **19 a 21 aciertos:** 🏆 **Nivel Arquitecto Hexagonal / NestJS Senior.** Dominas tanto la teoría de inversión de dependencias como los detalles de implementación en NestJS.
- **14 a 18 aciertos:** 🥈 **Nivel Intermedio-Avanzado.** Tienes muy buena base; repasa únicamente los puntos donde dudaste en los documentos `01` y `02`.
- **Menos de 14 aciertos:** 🌱 **En entrenamiento.** Te recomiendo volver a leer `01-ARQUITECTURA-LIMPIA-Y-HEXAGONAL.md` y `02-DOMINANDO-NESTJS-EN-SISDOC.md` teniendo abiertos al lado los archivos reales de `backend/src/modules/auth`.

