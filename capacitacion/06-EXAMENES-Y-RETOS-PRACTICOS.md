# 📝 06 - Exámenes de Certificación y Retos Prácticos (SisDoc)

Pon a prueba todo lo que has aprendido en los módulos 01 al 05.
> **📌 Regla de oro:** Responde primero en una hoja o bloc de notas **sin mirar el archivo `07-SOLUCIONARIO-EXAMENES.md`**. Al terminar, revisa tus respuestas con el solucionario y calcula tu puntuación.

---

## 🥉 PARTE 1: Examen de Arquitectura Limpia y Hexagonal (10 Preguntas)

**1. ¿Por qué en `src/modules/auth/application/ports.ts` se define tanto `export const USER_REPOSITORY = Symbol('USER_REPOSITORY')` como `export interface UserRepository`?**
- A) Porque Prisma exige usar `Symbol` para conectarse a PostgreSQL.
- B) Porque las `interface` de TypeScript desaparecen al compilar a JavaScript, y NestJS necesita un token real en tiempo de ejecución (`Symbol`) para poder inyectar la dependencia.
- C) Para que `architecture.spec.ts` pueda leer las interfaces con expresiones regulares.
- D) Es solo una convención estética; se podría poner `@Inject(UserRepository)` directamente con la interfaz.

**2. Según `src/architecture.spec.ts`, ¿cuál de los siguientes `import` haría FALLAR el test de arquitectura si lo escribes dentro de `src/modules/files/application/upload-document.use-case.ts`?**
- A) `import { Inject, Injectable } from '@nestjs/common';`
- B) `import { ValidationError } from '../../../shared/domain/domain-error';`
- C) `import { writeFile } from 'fs/promises';`
- D) `import { assertAccess } from '../domain/document';`

**3. En el módulo `files`, la función `assertAccess(doc, userId, share, needed)` (`src/modules/files/domain/document.ts`) lanza `NotFoundError` (404) cuando un usuario no tiene permiso `VIEW`, pero lanza `ForbiddenError` (403) cuando sí tiene `VIEW` y le falta `EDIT`. ¿Cómo se llama este principio de diseño y por qué se hace?**
- A) Principio de Sustitución de Liskov; para ahorrar consultas SQL en Prisma.
- B) Regla *"lo ajeno no existe"* (Prevención de enumeración de recursos / IDOR); para que un usuario sin acceso ni siquiera pueda saber si un UUID de documento existe o no en el sistema.
- C) Limitación de Express; porque un `GET` no puede devolver 403 en REST.
- D) Rotación de permisos; para revocar la sesión del usuario si intenta adivinar un ID.

**4. ¿Cómo se comunica el módulo `chat` con el módulo `files` cuando un usuario adjunta un documento a un mensaje en `SendMessageUseCase`?**
- A) `SendMessageUseCase` inyecta `PrismaService` y consulta directamente `this.prisma.document.findUnique(...)`.
- B) `SendMessageUseCase` importa `PrismaDocumentRepository` desde `../../files/infrastructure/prisma-document.repository`.
- C) `SendMessageUseCase` usa su propio puerto `DOCUMENTS_PORT` (`DocumentsPort`), el cual es implementado en la infraestructura de `chat` por `FilesDocumentsAdapter`, que a su vez consume `DOCUMENTS_API` exportado en `files.public-api.ts`.
- D) A través de una petición HTTP `fetch('http://localhost:3000/api/v1/documents')`.

**5. ¿Por qué en `prisma/schema.prisma` la tabla `MessageAttachment` (del módulo `chat`) tiene un campo `documentId String` pero NO tiene `@relation(fields: [documentId], references: [id])` hacia el modelo `Document` (del módulo `files`)?**
- A) Porque Prisma no soporta más de una relación por tabla.
- B) Es un descuido del desarrollador que creó la migración.
- C) Para mantener los módulos `chat` y `files` desacoplados a nivel de base de datos; `chat` solo guarda la referencia lógica (`documentId`, `versionId`) y valida su existencia y permisos a través del puerto `DocumentsPort`.
- D) Porque PostgreSQL no permite claves foráneas entre tablas con UUID.

**6. En `DownloadDocumentUseCase` (`src/modules/files/application/download-document.use-case.ts`), primero se ejecuta `await this.logs.append(...)` y DESPUÉS `await this.storage.read(...)`. ¿Por qué el orden es crítico?**
- A) Porque `storage.read()` borra el archivo después de leerlo.
- B) Para garantizar trazabilidad estricta (auditoría): si el registro en la bitácora de accesos falla por cualquier motivo, la excepción detiene la ejecución y el archivo jamás se entrega sin dejar rastro.
- C) Porque Prisma bloquea el hilo de Node.js si se abre un `Stream` antes.
- D) Da igual el orden, podría ponerse después del `return`.

**7. ¿Por qué `LoginUseCase` pide un puerto `@Inject(CLOCK) private readonly clock: Clock` en lugar de llamar directamente a `new Date()` dentro del caso de uso?**
- A) Porque `new Date()` en Node.js es lento.
- B) Porque en Arquitectura Hexagonal el tiempo actual es un efecto secundario del entorno; inyectar `Clock` permite usar `FakeClock` en los tests unitarios y avanzar el tiempo (`w.clock.advance(minutes(15))`) de forma determinista e instantánea sin esperar 15 minutos reales ni manipular prototipos globales de JS.
- C) Porque `architecture.spec.ts` prohíbe usar `Date` en el dominio.
- D) Para sincronizar la hora con el navegador del cliente.

**8. Si mañana la empresa decide guardar los documentos en Amazon S3 en lugar del disco duro local (`LocalFileStorage`), ¿qué archivos del módulo `files` tendrías que crear o modificar?**
- A) Habría que reescribir `UploadDocumentUseCase`, `DownloadDocumentUseCase`, `DocumentsController` y `document.ts`.
- B) Solo crear un nuevo adaptador `S3FileStorage implements FileStorage` en `files/infrastructure/` y cambiar `{ provide: FILE_STORAGE, useClass: S3FileStorage }` en `files.module.ts`. Los casos de uso y el dominio no se tocan.
- C) Habría que cambiar `schema.prisma` y hacer una migración de base de datos.
- D) Habría que modificar `FilesDocumentsAdapter` en el módulo `chat`.

**9. ¿En qué capa del proyecto vive la conversión de `sizeBytes: BigInt` (devuelto por Prisma/PostgreSQL) a `sizeBytes: number` y de `deletedAt: Date | null` a `deleted: boolean`?**
- A) En `DocumentsController` (`presentation/`).
- B) En `PrismaDocumentRepository` (`infrastructure/`), mediante las funciones mapeadoras `toDoc` y `toVersion`, para que el dominio jamás se entere de detalles de almacenamiento de Prisma/PostgreSQL.
- C) En `DomainErrorFilter` (`shared/presentation/`).
- D) En el frontend.

**10. ¿Qué sucede en `RefreshSessionUseCase` si un atacante roba el `refreshToken` de un usuario y lo envía a `POST /api/v1/auth/refresh` después de que el usuario legítimo ya lo había rotado?**
- A) El servidor simplemente devuelve `401 Unauthorized` al atacante, pero la sesión del usuario legítimo sigue funcionando normal.
- B) El caso de uso no encuentra el hash en `refreshHash`, lo busca en `prevRefreshHash`, detecta que es un token reutilizado (`ROTATION_REUSE`), **revoca inmediatamente la sesión entera** y registra `REFRESH_REUSE` en `SecurityEventLog`, protegiendo la cuenta.
- C) El servidor bloquea la cuenta del usuario por 60 minutos en `lockout-policy.ts`.
- D) Devuelve el mismo `accessToken` que se emitió hace unos segundos.

---

## 🥈 PARTE 2: Examen de Dominio de NestJS y Seguridad (8 Preguntas)

**11. ¿Cómo consigue `JwtCookieGuard` bloquear en todas las rutas del sistema a un usuario que tiene `mustChangePassword: true`, PERO dejarlo pasar únicamente en `GET /auth/me`, `POST /auth/change-password` y `POST /auth/logout-all`?**
- A) Tiene un `if (req.url.includes('change-password'))` hardcodeado dentro del Guard.
- B) Esas tres rutas no tienen `@UseGuards(JwtCookieGuard)`.
- C) Esas tres rutas están decoradas con `@AllowWhenPasswordChangePending()`, que guarda metadatos con `SetMetadata`, y `JwtCookieGuard` los lee en tiempo de ejecución usando `this.reflector.getAllAndOverride(...)`.
- D) Usa un middleware distinto en `app.setup.ts`.

**12. ¿Qué ocurre cuando un Caso de Uso lanza `throw new SessionLimitReachedError(3)` durante el login?**
- A) NestJS devuelve `500 Internal Server Error` porque no es una `HttpException`.
- B) `AuthController` tiene un `try / catch` que hace `res.status(409).send(...)`.
- C) Como `SessionLimitReachedError` hereda de `DomainError` con `code = 'SESSION_LIMIT'`, el filtro global `DomainErrorFilter` (`@Catch(DomainError)`) lo intercepta y lo traduce automáticamente a HTTP `409 Conflict` con `{ code: 'SESSION_LIMIT', message: '...' }`.
- D) Se desconecta la base de datos.

**13. ¿Para qué sirven las tres opciones `{ whitelist: true, transform: true, forbidNonWhitelisted: true }` pasadas al `ValidationPipe` en `src/app.setup.ts`?**
- A) Para comprimir el JSON de respuesta y acelerar Express.
- B) `whitelist` y `forbidNonWhitelisted` rechazan con `400 Bad Request` cualquier petición que envíe propiedades no declaradas con decoradores de `class-validator` en el DTO (evitando ataques de *Mass Assignment*), y `transform` instancia el DTO y convierte tipos.
- C) Para permitir peticiones CORS desde cualquier dominio en la lista blanca.
- D) Para encriptar automáticamente las contraseñas en los DTOs.

**14. En `AuthController.doLogin()`, la firma incluye `@Res({ passthrough: true }) res: Response`. ¿Por qué se usa `{ passthrough: true }` en NestJS?**
- A) Para que Express ignore los errores de cookies.
- B) Porque en NestJS, si inyectas `@Res()` sin `passthrough: true`, NestJS desactiva su manejo estándar de respuestas (filtros de excepciones, interceptores, serialización automática del `return`) y te obliga a llamar a `res.json()` manualmente. Con `passthrough: true`, puedes escribir cookies en `res` y seguir haciendo `return { status: 'OK', ... }` normalmente.
- C) Para reenviar la petición al proxy Nginx.
- D) Para que las cookies no sean `HttpOnly`.

**15. ¿Por qué `AuthCookies` (`src/modules/auth/presentation/auth-cookies.ts`) configura el `path` de la cookie `sisdoc_rt` (refresh token) como `/api/v1/auth`, mientras que `sisdoc_at` (access token) tiene `path: '/'`?**
- A) Porque las cookies no pueden tener el mismo nombre en el mismo path.
- B) Por principio de mínimo privilegio en la red: el `accessToken` se necesita en todas las peticiones (`/api/v1/documents`, WebSockets, etc.), pero el `refreshToken` solo se necesita para refrescar o cerrar sesión en `/api/v1/auth/*`. Así el navegador jamás envía el `refreshToken` en el resto de peticiones.
- C) Porque Express borra las cookies que tienen `path: '/'` cada 15 minutos.
- D) Para que el frontend pueda leer `sisdoc_rt` con `document.cookie`.

**16. ¿Cómo se autentica un cliente cuando se conecta por WebSocket a `ChatGateway` (`src/modules/chat/presentation/chat.gateway.ts`)?**
- A) Envía el token JWT por un evento `socket.emit('login', token)` después de conectarse.
- B) No tiene autenticación; cualquiera puede enviar mensajes conociendo el `conversationId`.
- C) En `handleConnection(client: Socket)`, lee la cabecera `cookie` del handshake inicial con `this.cookies.readAccessFromHeader(...)`, ejecuta `this.authenticate.execute({ accessToken })` y, si es válido, guarda `userId` y `sessionId` en `client.data` (o desconecta el socket si falla).
- D) Usa un guard `@UseGuards(JwtCookieGuard)` en `handleConnection`.

**17. En `LoginUseCase`, cuando un usuario intenta iniciar sesión con un correo que NO existe en la base de datos, el código ejecuta `await this.hasher.verifyDummy(input.password)`. ¿Qué vulnerabilidad mitiga esta línea?**
- A) Inyección SQL (SQL Injection).
- B) Cross-Site Request Forgery (CSRF).
- C) Ataque de enumeración de usuarios por canal lateral de tiempo (*Timing Attack*), haciendo que una petición con correo inexistente tarde lo mismo (~Argon2id) que una con correo existente.
- D) Desbordamiento de memoria en PostgreSQL.

**18. En `LocalFileStorage` (`src/modules/files/infrastructure/local-file-storage.ts`), al guardar un archivo se ejecuta `await writeFile(path, body, { flag: 'wx' })`. ¿Qué hace exactamente `flag: 'wx'` y qué hace `pathOf(key)`?**
- A) `wx` comprime el archivo en formato ZIP y `pathOf` le cambia la extensión a `.pdf`.
- B) `pathOf(key)` resuelve la ruta absoluta y verifica `full.startsWith(this.root + sep)` para impedir ataques de *Path Traversal* (como `../../etc/passwd`), y `flag: 'wx'` exige escritura exclusiva (falla si el archivo ya existe en disco), garantizando que una versión jamás pueda sobrescribirse.
- C) `wx` da permisos de ejecución en Windows (`Windows eXecutable`).
- D) Permite que varios usuarios escriban en el mismo archivo al mismo tiempo.

---

## 🥇 PARTE 3: "Caza el Bug Arquitectónico" (3 Escenarios de Código)

Analiza los siguientes 3 fragmentos de código. Cada uno tiene **violaciones graves** a la arquitectura hexagonal o a la seguridad de SisDoc. Encuentra todos los errores en cada fragmento:

### 🔍 Escenario A: Archivo en `src/modules/files/domain/document-validator.ts`
```typescript
import { BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../../shared/infrastructure/prisma/prisma.service';

export async function ensureTitleIsUnique(prisma: PrismaService, title: string) {
  const count = await prisma.document.count({ where: { title } });
  if (count > 0) {
    throw new BadRequestException('El título ya existe');
  }
}
```
- **Pregunta A1:** ¿Qué 3 reglas de `src/architecture.spec.ts` rompe este archivo por estar ubicado en `domain/`?
- **Pregunta A2:** ¿Cómo deberías rediseñarlo correctamente siguiendo la arquitectura hexagonal de SisDoc?

---

### 🔍 Escenario B: Archivo en `src/modules/chat/application/delete-message.use-case.ts`
```typescript
import { Injectable } from '@nestjs/common';
import { PrismaDocumentRepository } from '../../files/infrastructure/prisma-document.repository';
import { ForbiddenError } from '../../../shared/domain/domain-error';

@Injectable()
export class DeleteMessageUseCase {
  constructor(private readonly docsRepo: PrismaDocumentRepository) {}

  async execute(messageId: string, documentId: string, userId: string) {
    const doc = await this.docsRepo.findById(documentId);
    if (doc?.ownerId !== userId) throw new ForbiddenError();
    // ...
  }
}
```
- **Pregunta B1:** ¿Qué 2 reglas de `src/architecture.spec.ts` rompe este Caso de Uso?
- **Pregunta B2:** Aunque no existiera `architecture.spec.ts`, ¿por qué fallaría NestJS al arrancar si intentas inyectar `PrismaDocumentRepository` dentro de `ChatModule`?

---

### 🔍 Escenario C: Mira el comentario `TODO` real en `src/modules/chat/presentation/chat.gateway.ts` (líneas 45-49)
```typescript
  @SubscribeMessage('conversation:join')
  async onJoin(@ConnectedSocket() client: Socket, @MessageBody() body: { conversationId: string }) {
    // TODO módulo chat: verificar pertenencia antes de unir a la sala (hoy cualquier usuario autenticado podría unirse)
    client.join(`conversation:${body.conversationId}`);
  }
```
- **Pregunta C1:** ¿Cuál es el riesgo de seguridad actual en ese método `onJoin`?
- **Pregunta C2:** ¿Cómo lo solucionarías respetando la Arquitectura Hexagonal sin meter `PrismaService` en `ChatGateway`?

---

## 💻 PARTE 4: Retos Prácticos de Programación (Hands-On)

Realiza estos ejercicios en tu entorno para consolidar tu dominio práctico:

### Reto 1: Rompe y repara el Guardián de Arquitectura (5 min)
1. Abre `src/modules/auth/domain/user.ts` y agrega temporalmente en la línea 1:
   `import { Injectable } from '@nestjs/common';`
2. Corre en consola: `npx jest src/architecture.spec.ts`
3. Observa el mensaje de error exacto que arroja el test.
4. Deshaz el cambio y vuelve a correr el test hasta que esté en verde.

### Reto 2: Soluciona el `TODO` de `ChatGateway` con un Caso de Uso + Test Unitario (30 min)
1. Crea un nuevo caso de uso `src/modules/chat/application/join-conversation.use-case.ts` (`JoinConversationUseCase`) que inyecte `@Inject(CONVERSATION_REPOSITORY) private readonly conversations: ConversationRepository`.
2. Si `!(await this.conversations.getMemberIds(input.conversationId)).includes(input.userId)`, debe lanzar `ForbiddenError('No perteneces a esta conversación')`.
3. Regístralo en `ChatModule` y úsalo dentro de `ChatGateway.onJoin` antes de ejecutar `client.join(...)`.
4. Crea un archivo de prueba `src/modules/chat/application/join-conversation.use-case.spec.ts` con un `InMemoryConversationRepository` para probar tanto el caso exitoso como el caso en que un intruso intenta unirse.
5. Corre `npm test` y verifica que todos los tests (incluido `architecture.spec.ts`) pasen en verde.

### Reto 3: Agrega la regla de "Al menos un número y una mayúscula" en `password-policy.ts` (20 min)
1. Observa cómo funciona `validatePassword` en `src/modules/auth/domain/password-policy.ts` y sus pruebas en `src/modules/auth/domain/domain-policies.spec.ts`.
2. Crea una función auxiliar pura `hasUpperAndDigit(password: string): boolean` en `password-policy.ts` y agrégale su prueba unitaria en `domain-policies.spec.ts`. *(Cuidado: revisa si las contraseñas de prueba existentes en los otros `.spec.ts` cumplen la condición)*.

