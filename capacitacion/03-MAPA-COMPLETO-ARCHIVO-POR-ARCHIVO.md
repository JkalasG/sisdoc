# 🗂️ 03 - Mapa Completo Archivo por Archivo de `@backend`

Esta es tu guía de referencia rápida y profunda. Aquí está documentado **absolutamente cada archivo** de `c:\sistemas\sisdoc\backend`, qué hace, a qué capa pertenece y por qué existe.

---

## 📁 1. Raíz del Proyecto, Prisma y Scripts

| Archivo | ¿Qué es y para qué sirve? | Detalles clave que debes observar |
| :--- | :--- | :--- |
| `package.json` | Manifiesto de dependencias, scripts de npm y configuración de Jest para pruebas unitarias. | Configura `rootDir: "src"` para tests rápidos (`npm test`) y separa `npm run test:e2e` hacia `test/jest-e2e.json`. Incluye `device:approve` para aprobar dispositivos por CLI. |
| `tsconfig.json` | Configuración del compilador de TypeScript. | Activa `strict: true` (máxima seguridad de tipos), `emitDecoratorMetadata` y `experimentalDecorators` (indispensables para que la inyección de dependencias de NestJS funcione) y el alias `@/* -> src/*`. |
| `nest-cli.json` | Configuración del CLI de NestJS (`nest build`, `nest start`). | Define `sourceRoot: "src"` y limpia `dist/` al compilar. |
| `.env` / `.env.example` | Variables de entorno (conexión PostgreSQL, secreto JWT, orígenes CORS, carpeta de archivos). | `.env.example` sirve de plantilla documentada sin secretos reales; `.env` contiene la configuración local. |
| `prisma/schema.prisma` | Esquema único de la base de datos PostgreSQL. | Dividido visualmente por módulos (`auth`, `files`, `chat`). **Detalle clave:** En el módulo `chat`, `MessageAttachment.documentId` **NO** tiene `@relation` (Foreign Key física) hacia `Document` para mantener los módulos desacoplados a nivel de datos. |
| `prisma/seed.ts` | Semilla inicial de la base de datos (`npm run prisma:seed`). | Crea el usuario administrador inicial con contraseña hasheada con **Argon2id**, `mustChangePassword: true` y registra su primera entrada en `PasswordHistory`. |
| `scripts/approve-device.ts` | Script administrativo por consola (`npm run device:approve -- correo`). | Como ningún dispositivo nuevo puede iniciar sesión hasta ser `TRUSTED`, este script permite aprobar el primer dispositivo del administrador al desplegar el sistema desde cero y deja constancia en `SecurityEvent`. |

---

## 📁 2. Arranque Global y Guardián de Arquitectura (`src/`)

| Archivo | Capa | ¿Qué hace y cómo funciona? |
| :--- | :--- | :--- |
| `src/main.ts` | Arranque (Bootstrap) | Punto de entrada de la aplicación. Crea la instancia NestJS con `NestFactory.create(AppModule)`, aplica `configureApp(app)`, monta la documentación interactiva **Swagger** en `/docs` (solo fuera de producción) y pone a escuchar el puerto. |
| `src/app.setup.ts` | Presentación Global | Configura el pipeline HTTP común entre producción y los tests E2E: `trust proxy` (para leer la IP real detrás de Nginx sin ser engañado por `X-Forwarded-For` falsos), `helmet()`, `cookieParser()`, `csrfProtection()`, CORS con credenciales, prefijo global `/api/v1`, `DomainErrorFilter` y `ValidationPipe`. |
| `src/app.module.ts` | Ensamblado Raíz (Root Module) | Une las piezas del Monolito Modular: importa `ConfigModule` (global), `EventEmitterModule`, `ThrottlerModule` (límite de 120 peticiones/minuto), `PrismaModule`, y los módulos de negocio: `AuthModule`, `FilesModule`, `ChatModule`. |
| `src/architecture.spec.ts` | Test de Arquitectura | **El policía del proyecto.** Recorre con `fs` todos los archivos de `src/modules/` y analiza sus `import` con expresiones regulares. Garantiza que `domain/` sea puro, que `application/` no importe infraestructura ni presentación, que Prisma solo viva en `infrastructure/` y que ningún módulo importe archivos internos de otro módulo salvo su `*.public-api.ts`. |

---

## 📁 3. Núcleo Compartido (`src/shared/`)

En `shared/` vive **únicamente** lo que es transversal a todos los módulos, dividido también en las capas de la arquitectura:

| Archivo | Capa | ¿Qué hace y por qué está ahí? |
| :--- | :--- | :--- |
| `src/shared/domain/domain-error.ts` | Dominio Compartido | Define la clase base `DomainError(message, code)` y los tres errores universales de negocio: `NotFoundError` (`NOT_FOUND`), `ForbiddenError` (`FORBIDDEN`) y `ValidationError` (`VALIDATION`). Permite que cualquier módulo exprese errores de negocio sin importar nada de HTTP ni de NestJS. |
| `src/shared/infrastructure/prisma/prisma.service.ts` | Infraestructura Compartida | Extiende `PrismaClient` e implementa los hooks de ciclo de vida de NestJS `OnModuleInit` (`$connect()`) y `OnModuleDestroy` (`$disconnect()`). |
| `src/shared/infrastructure/prisma/prisma.module.ts` | Infraestructura Compartida | Módulo decorado con `@Global()` que provee y exporta `PrismaService` para los repositorios de infraestructura de todos los módulos. |
| `src/shared/presentation/csrf.middleware.ts` | Presentación Compartida | Middleware Express que protege todas las peticiones mutadoras (`POST`, `PUT`, `PATCH`, `DELETE`). Exige que lleven la cabecera `X-Requested-With: XMLHttpRequest` y que, si incluyen cabecera `Origin`, esta coincida con los orígenes permitidos en `CORS_ORIGIN`. |
| `src/shared/presentation/current-user.decorator.ts` | Presentación Compartida | Define la interfaz `AuthUser` (`{ id, sessionId?, deviceId? }`) y el decorador `@CurrentUser()` para extraer `req.user` de forma limpia en los controladores. |
| `src/shared/presentation/domain-error.filter.ts` | Presentación Compartida | Filtro global (`@Catch(DomainError)`) que captura cualquier `DomainError` lanzado por el dominio o los casos de uso y lo convierte en una respuesta JSON `{ code, message }` con el código de estado HTTP exacto (`404`, `403`, `400`, `401`, `409` o `422`). |

---

## 📁 4. Módulo de Autenticación y Sesiones (`src/modules/auth/`)

Es el módulo más completo y un ejemplo perfecto de **Arquitectura Hexagonal** aplicada a seguridad crítica.

### 4.1. Raíz del Módulo `auth`
| Archivo | Rol | Explicación |
| :--- | :--- | :--- |
| `auth.module.ts` | Ensamblador (DI) | Registra los 6 casos de uso, `AuthCookies`, `JwtCookieGuard` y conecta los **7 puertos (`Symbol`)** con sus **7 adaptadores de infraestructura**. Exporta únicamente `JwtCookieGuard`, `AuthenticateRequestUseCase` y `AuthCookies`. |
| `auth.public-api.ts` | Frontera Pública | **Único archivo que otros módulos pueden importar.** Re-exporta `AuthModule`, `JwtCookieGuard`, `AllowWhenPasswordChangePending`, `AuthCookies` y `AuthenticateRequestUseCase`. |

### 4.2. Capa de Dominio (`auth/domain/`) — *100 % TypeScript puro, sin Nest ni Prisma*
| Archivo | Qué modela o qué regla de negocio contiene |
| :--- | :--- |
| `user.ts` | Define la entidad `User`, el tipo `UserStatus` (`'ACTIVE' \| 'DISABLED'`) y la función pura `normalizeEmail(email)` (`trim().toLowerCase()`). |
| `device.ts` | Define la entidad `Device`, el estado `DeviceStatus` (`'PENDING' \| 'TRUSTED' \| 'BLOCKED'`) y la función pura `describeUserAgent(ua)` que convierte un `User-Agent` crudo en una etiqueta legible como `"Chrome en Windows"`. |
| `session.ts` | Define la entidad `Session`, las razones de revocación (`RevokeReason`) y las constantes de `SESSION_POLICY` (access token de 15 min, inactividad máxima de 30 min, duración absoluta de 12 h, máximo 3 sesiones simultáneas, y `touchEveryMs: 60_000`). Incluye las funciones puras `isSessionActive`, `sessionExpiry`, `inactiveBefore` y `shouldTouch`. |
| `lockout-policy.ts` | Regla de negocio de bloqueo progresivo de cuenta tras 5 intentos fallidos (`LOCKOUT.maxAttempts = 5`, bloqueos de `15 -> 30 -> 60` minutos). Contiene las funciones puras `isLocked`, `registerFailure` y `clearedState`. |
| `password-policy.ts` | Regla de negocio de validación de contraseñas (`validatePassword`): mínimo 12 y máximo 128 caracteres, historial de 5 contraseñas, prohibición de contraseñas comunes, de repetir un solo carácter o de incluir la parte local del correo del usuario. |
| `auth-errors.ts` | Errores de dominio específicos de autenticación que heredan de `DomainError`: `InvalidCredentialsError` (mismo mensaje para correo inexistente, clave errónea, cuenta bloqueada o deshabilitada para evitar enumeración de usuarios), `UnauthenticatedError`, `SessionLimitReachedError`, `DeviceBlockedError` y `PasswordChangeRequiredError`. |
| `domain-policies.spec.ts` | Pruebas unitarias puras que verifican `password-policy`, `lockout-policy`, `session` y utilidades de dominio en pocos milisegundos. |

### 4.3. Capa de Aplicación (`auth/application/`) — *Casos de Uso y Puertos*
| Archivo | Qué orquesta paso a paso |
| :--- | :--- |
| `ports.ts` | Define los **7 Puertos de Salida** (tokens `Symbol` + interfaces): `UserRepository`, `SessionRepository`, `DeviceRepository`, `PasswordHasher`, `TokenService`, `SecurityEventLog` y `Clock`. |
| `login.use-case.ts` | Orquesta el inicio de sesión: normaliza el email, busca al usuario, verifica la contraseña con Argon2 (o ejecuta `verifyDummy` si el usuario no existe), verifica estado `ACTIVE` y bloqueo temporal (`isLocked`), actualiza contador de fallos (`registerFailure`), verifica el dispositivo (`PENDING` devuelve `{ kind: 'DEVICE_PENDING' }`, `BLOCKED` lanza error, `TRUSTED` continúa), comprueba que no supere 3 sesiones vivas (`countLive`), crea la sesión con hash del refresh token y firma el JWT de acceso. |
| `authenticate-request.use-case.ts` | Se ejecuta en **cada petición HTTP protegida y al conectar un WebSocket**. Verifica la firma del JWT, consulta la sesión junto con su usuario y dispositivo en **una sola consulta** (`findWithOwner`), comprueba que la sesión esté activa (`isSessionActive`), el usuario `ACTIVE` y el dispositivo `TRUSTED`, actualiza `lastActivityAt` como máximo 1 vez por minuto (`shouldTouch`) y devuelve el `AuthContext`. |
| `refresh-session.use-case.ts` | Rota la sesión usando el refresh token: busca por `refreshHash`. Si no existe, busca en `prevRefreshHash`: si lo encuentra ahí, **detecta robo/reutilización de token y revoca la sesión entera (`ROTATION_REUSE`)**. Si es válido, verifica que la sesión, usuario y dispositivo sigan activos, rota atómicamente el refresh token (`rotate`) y emite un nuevo par de tokens. |
| `logout.use-case.ts` | Permite cerrar la sesión actual (`execute`, idempotente a partir del refresh token) o cerrar **todas** las sesiones del usuario (`executeAll`, revocando con motivo `LOGOUT_ALL`). |
| `change-password.use-case.ts` | Verifica que el usuario esté activo y no bloqueado, comprueba la contraseña actual (si falla, suma un intento fallido con `registerFailure` para impedir fuerza bruta desde una sesión abierta), valida la nueva contraseña con `validatePassword`, comprueba que no coincida con la actual ni con las últimas 5 del historial (`getPasswordHistory`), guarda la nueva contraseña y **revoca todas las demás sesiones del usuario conservando únicamente la sesión actual**. |
| `get-current-user.use-case.ts` | Busca al usuario por ID, comprueba que siga `ACTIVE` y devuelve solo sus campos públicos (`id`, `email`, `displayName`, `mustChangePassword`), ocultando hashes y contadores de bloqueo. |
| `login.use-case.spec.ts`, `session-lifecycle.spec.ts`, `change-password.use-case.spec.ts` | Suite exhaustiva de pruebas unitarias de todos los casos de uso usando los adaptadores en memoria (`fakes.ts`). |

### 4.4. Capa de Infraestructura (`auth/infrastructure/`) — *Adaptadores Reales*
| Archivo | Puerto que implementa | Cómo lo implementa técnicamente |
| :--- | :--- | :--- |
| `prisma-user.repository.ts` | `UserRepository` | Usa `PrismaService` para consultar `user`, actualizar el estado de bloqueo y ejecutar una transacción (`$transaction`) que actualiza la contraseña del usuario e inserta el hash en `passwordHistory`. |
| `prisma-session.repository.ts` | `SessionRepository` | Usa `PrismaService` para crear sesiones, hacer `findWithOwner` (con `include` de `user` y `device` en un solo `SELECT`), contar sesiones vivas (`countLive`) y hacer rotación atómica (`updateMany` verificando `refreshHash: oldHash` para evitar condiciones de carrera). |
| `prisma-device.repository.ts` | `DeviceRepository` | Gestiona la tabla `devices` en PostgreSQL mediante Prisma (búsqueda por clave compuesta `userId_keyHash`, creación en estado `PENDING` y actualización de `lastSeenAt` / `lastIp`). |
| `prisma-security-event.log.ts` | `SecurityEventLog` | Inserta eventos de auditoría en la tabla append-only `security_events`. Captura errores con `try/catch` y los escribe en el `Logger` de NestJS para que un fallo puntual de bitácora no tumbe el login. |
| `argon2-password-hasher.ts` | `PasswordHasher` | Usa la librería `argon2` con el algoritmo **Argon2id** (`memoryCost: 19456`, `timeCost: 2`). Implementa `verifyDummy` calculando una vez un hash ficticio para mitigar ataques de enumeración por tiempo. |
| `jwt-token-service.ts` | `TokenService` | Usa `JwtService` (`@nestjs/jwt`) con `HS256` y exige que `JWT_ACCESS_SECRET` tenga al menos 32 caracteres. Genera tokens opacos de 256 bits con `crypto.randomBytes(32)` y los hashea con `SHA-256`. |
| `system-clock.ts` | `Clock` | Devuelve `new Date()` del sistema operativo. |

### 4.5. Capa de Presentación (`auth/presentation/`) y Testing (`auth/testing/`)
| Archivo | Rol | Qué hace exactamente |
| :--- | :--- | :--- |
| `auth-cookies.ts` | Helper HTTP de Cookies | Centraliza la lectura, escritura y borrado de las 3 cookies (`sisdoc_at`, `sisdoc_rt`, `sisdoc_dk`) con `httpOnly: true`, `sameSite: 'strict'` y prefijos `__Host-` / `__Secure-` en producción. Incluye `readAccessFromHeader` para WebSockets. |
| `jwt-cookie.guard.ts` | Guard de NestJS | Protege rutas HTTP leyendo la cookie de acceso, ejecutando `AuthenticateRequestUseCase`, validando `mustChangePassword` mediante `Reflector` y poblando `req.user`. |
| `auth.controller.ts` | Controlador REST (`/api/v1/auth`) | Expone los endpoints `POST /login` (con rate limit de 10/min), `POST /refresh`, `POST /logout`, `POST /logout-all`, `POST /change-password` (rate limit de 5/min) y `GET /me`. |
| `testing/fakes.ts` | Adaptadores en Memoria (Test Doubles) | Implementa versiones 100 % en memoria (`FakeClock`, `FakeHasher`, `FakeTokens`, `FakeEvents`, `InMemoryUsers`, `InMemoryDevices`, `InMemorySessions`) y la función `buildWorld()` para probar toda la capa de aplicación sin tocar PostgreSQL. |

---

## 📁 5. Módulo de Gestión Documental (`src/modules/files/`)

Gestiona documentos, versiones inmutables, permisos compartidos, flujos de revisión y trazabilidad append-only.

| Archivo | Capa | ¿Qué hace y cómo funciona? |
| :--- | :--- | :--- |
| `files.contract.ts` | Contrato Público | Define el token `DOCUMENTS_API` y la interfaz `DocumentsApi` (`getAttachable` y `shareWithUsers`), que es lo único que otros módulos pueden usar para interactuar con documentos. |
| `files.public-api.ts` | Frontera Pública | Re-exporta `files.contract.ts` y `FilesModule`. |
| `files.module.ts` | Ensamblador (DI) | Importa `AuthModule` (desde su `auth.public-api`), registra los casos de uso y conecta `DOCUMENT_REPOSITORY`, `ACCESS_LOG_REPOSITORY`, `FILE_STORAGE` y `DOCUMENTS_API`. Exporta solo `DOCUMENTS_API`. |
| `domain/document.ts` | Dominio | Define `Document`, `DocumentVersion`, `Review`, `AccessLogEntry` y las reglas de negocio: `hasPermission` (jerarquía `VIEW < DOWNLOAD < EDIT`, el dueño puede todo salvo si está borrado), **`assertAccess`** (implementa la regla de seguridad *"lo ajeno no existe"*: si no tienes permiso ni de `VIEW`, lanza `NotFoundError` 404 para no revelar que el documento existe; si tienes `VIEW` pero no el permiso requerido, lanza `ForbiddenError` 403) y `statusAfterDecision`. |
| `domain/ports.ts` | Puertos | Define los tokens e interfaces `DocumentRepository`, `AccessLogRepository` (solo `append` y `listByDocument`, jamás update/delete) y `FileStorage` (`put` y `read`). |
| `application/upload-document.use-case.ts` | Aplicación | Valida tamaño máximo, que el archivo no esté vacío y lista blanca de MIME types (`ALLOWED_MIME`), calcula el hash `SHA-256` del contenido, guarda el binario en `FileStorage` con una clave UUID aleatoria (nunca el nombre original del usuario), crea el documento o una nueva versión N+1 y registra `UPLOAD` o `NEW_VERSION` en la bitácora. |
| `application/download-document.use-case.ts` | Aplicación | Verifica permiso `DOWNLOAD` con `assertAccess`, busca la versión solicitada (o la actual), **escribe primero en la bitácora `AccessLogRepository` (`DOWNLOAD`)** y devuelve el stream de lectura desde `FileStorage`. |
| `application/review-document.use-case.ts` | Aplicación | `request()`: verifica permiso `EDIT`, otorga permiso `DOWNLOAD` al revisor asignado, crea la revisión, pasa el documento a `IN_REVIEW` y registra `REVIEW_REQUESTED`. `decide()`: verifica que quien decide sea el revisor asignado y que esté `PENDING`, actualiza el estado del documento según `statusAfterDecision` y registra `REVIEW_DECIDED`. |
| `application/get-history.use-case.ts` | Aplicación | Verifica primero acceso `VIEW` (para devolver 404 a extraños) y luego exige que sea el propietario (`ownerId === userId`, o 403) antes de devolver el historial de accesos paginado por cursor. |
| `application/documents-api.service.ts` | Aplicación (Contrato) | Implementa `DocumentsApi` para otros módulos: valida si un usuario puede adjuntar un documento (`DOWNLOAD`) y comparte el documento con los destinatarios sin degradar permisos si ya tenían `EDIT`. |
| `infrastructure/local-file-storage.ts` | Infraestructura | Implementa `FileStorage` en el disco local. Incluye `pathOf(key)` con protección contra *Path Traversal* (`!full.startsWith(this.root + sep)`) y escribe archivos con la bandera `flag: 'wx'` (falla si el archivo ya existe, garantizando inmutabilidad física). |
| `infrastructure/prisma-document.repository.ts` | Infraestructura | Implementa `DocumentRepository` con Prisma. Usa transacciones (`$transaction`) para crear documento + versión 1 y para calcular el siguiente `versionNumber` de forma segura. Traduce entre tipos de Prisma (`BigInt`, `deletedAt`) y tipos del dominio (`number`, `deleted: boolean`). |
| `infrastructure/prisma-access-log.repository.ts` | Infraestructura | Implementa `AccessLogRepository` sobre la tabla `document_access_logs` con paginación por cursor. |
| `presentation/documents.controller.ts` | Presentación REST | Controlador protegido con `@UseGuards(JwtCookieGuard)`. Expone `POST /documents` (`FileInterceptor`), `POST /documents/:id/versions`, `GET /documents/:id/download` (devuelve `StreamableFile`), `GET /documents/:id/history`, `POST /documents/:id/reviews` y `PATCH /reviews/:reviewId`. |

---

## 📁 6. Módulo de Mensajería en Tiempo Real (`src/modules/chat/`)

Muestra cómo construir un módulo con WebSockets que colabora con `auth` y `files` sin acoplarse a ellos.

| Archivo | Capa | ¿Qué hace y cómo funciona? |
| :--- | :--- | :--- |
| `chat.module.ts` | Ensamblador (DI) | Importa `FilesModule` y `AuthModule` a través de sus `*.public-api.ts`. Conecta `CONVERSATION_REPOSITORY`, `MESSAGE_REPOSITORY` y `DOCUMENTS_PORT` (`FilesDocumentsAdapter`). |
| `domain/ports.ts` | Dominio / Puertos | Define las entidades de chat (`Message`, `MessageAttachment`) y los 3 puertos del módulo: `ConversationRepository`, `MessageRepository` y `DocumentsPort`. Nota cómo `chat` define su propio `DocumentsPort` sin mencionar nada del módulo `files`. |
| `application/send-message.use-case.ts` | Aplicación | Verifica que el autor sea miembro de la conversación, que el mensaje no esté vacío, valida cada adjunto a través de `this.documents.resolveAttachment`, guarda el mensaje en BD, otorga permisos de descarga a los destinatarios de la conversación mediante `this.documents.shareWithRecipients` (dejando trazabilidad con canal `chat:<conversationId>`) y emite el evento `'chat.message.sent'`. |
| `infrastructure/files-documents.adapter.ts` | Infraestructura (ACL) | **Capa Anticorrupción (Anti-Corruption Layer).** Implementa `DocumentsPort` de `chat` llamando a `DOCUMENTS_API` de `files.public-api.ts`. Si mañana `files` cambia la firma de su contrato, solo se ajusta este adaptador de 25 líneas. |
| `infrastructure/prisma-chat.repositories.ts` | Infraestructura | Implementa `PrismaConversationRepository` y `PrismaMessageRepository` usando `PrismaService`. |
| `presentation/chat.gateway.ts` | Presentación WebSocket | Gateway Socket.io en el namespace `chat`. Autentica el handshake leyendo la cookie HTTP con `AuthCookies` y `AuthenticateRequestUseCase`, y atiende los eventos `message:send` y `conversation:join`. |

---

## 📁 7. Pruebas End-to-End (`test/`)

| Archivo | ¿Qué hace? |
| :--- | :--- |
| `test/jest-e2e.json` | Configuración de Jest exclusiva para pruebas `.e2e-spec.ts` (ejecución serie `--runInBand`). |
| `test/setup-env.js` | Define las variables de entorno de pruebas antes de cargar los módulos (apunta a la base de datos `sisdoc_test`, desactiva el rate limiting con `DISABLE_THROTTLE = 'true'` y usa una carpeta temporal del sistema para subir archivos). |
| `test/global-setup.js` | Ejecuta `npx prisma migrate deploy` contra la base de datos `sisdoc_test` una vez antes de iniciar toda la suite E2E. |
| `test/helpers.ts` | Utilidades para los tests E2E: `createApp()`, `resetDb()` (`TRUNCATE ... CASCADE`), `createUser()`, `trustDevice()`, `login()`, `loggedInUser()` y extractores de cookies. |
| `test/auth.e2e-spec.ts` | Prueba el flujo HTTP real completo de autenticación: protección CSRF, cabeceras Helmet, validación de DTOs, aprobación de dispositivos, rotación y detección de robo de refresh tokens, revocación inmediata en logout, bloqueo de cuenta tras 5 fallos, cambio obligatorio de contraseña y auditoría en BD. |
| `test/files-isolation.e2e-spec.ts` | Prueba el aislamiento de documentos por HTTP: verifica que todas las rutas exijan sesión, que un documento ajeno devuelva `404` idéntico a uno inexistente, que un revisor con `DOWNLOAD` reciba `200` al descargar pero `403` al intentar editar o ver historial, y que las versiones y bitácoras sean inmutables. |

