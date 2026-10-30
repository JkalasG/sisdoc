# 🌐 09 - Cómo Dividir el Sistema en Varios Servidores (Dejar Solo Mensajería en el Servidor Actual y Mover el Resto)

Aquí es donde vas a ver en acción **por qué valió la pena escribir todo con Arquitectura Hexagonal y Puertos/Adaptadores**.

Imagina este escenario real que planteas:
- **Servidor 1 (Servidor Actual - IP `10.0.0.10`):** Quieres que aquí **SOLO viva la Mensajería (`ChatModule` / WebSockets)**. Si 5,000 personas están chateando al mismo tiempo, solo consumen la RAM y CPU de este servidor.
- **Servidor 2 (Servidor Core - IP `10.0.0.20`):** Aquí mueves **Login (`AuthModule`), Archivos (`FilesModule`), Asistencia en Frontera (`AttendanceModule`), Correspondencia (`CorrespondenceModule`) y Encuestas (`TrainingModule`)**.
- **Servidor 3 (Opcional - Worker):** Aquí corre el **Firmador de PDFs** con BullMQ.

Tienes **2 formas de hacerlo** (desde la más rápida que toma **10 minutos** hasta la separación total en microservicios independientes). Y en ninguna de las dos tienes que tocar tus Casos de Uso ni tu Dominio.

---

## 🚀 Forma 1: División por Variable de Entorno (`SERVER_ROLE`) — *Toma 10 minutos, CERO cambios en módulos*

Si ambos servidores (`Servidor 1 - Chat` y `Servidor 2 - Core`) tienen acceso por red interna a la misma base de datos PostgreSQL y al mismo Redis, **no necesitas reescribir nada**. Usas exactamente el mismo repositorio de Git en ambos servidores y le dices a [`src/app.module.ts`](file:///c:/sistemas/sisdoc/backend/src/app.module.ts) qué módulos encender según una variable en el `.env` (`SERVER_ROLE`).

```mermaid
flowchart LR
    User["Navegador / App Móvil"] --> Nginx["Nginx (Puerta de Entrada)"]

    Nginx -->|"/socket.io/chat →"| S1["Servidor 1 (Actual)\nSERVER_ROLE=chat\nSolo abre ChatGateway"]
    Nginx -->|"/api/v1/* →"| S2["Servidor 2 (Nuevo)\nSERVER_ROLE=core\nAuth, Files, Asistencia, etc."]

    S1 --> PG[("PostgreSQL + Redis")]
    S2 --> PG
```

### Paso 1: Modificar `src/app.module.ts` para cargar módulos según el servidor

Mira qué limpio queda `src/app.module.ts`:

```typescript
import { Module, Type } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { PrismaModule } from './shared/infrastructure/prisma/prisma.module';
import { AuthModule } from './modules/auth/auth.module';
import { FilesModule } from './modules/files/files.module';
import { ChatModule } from './modules/chat/chat.module';

// Decide qué módulos encender según la variable SERVER_ROLE del archivo .env
function getActiveModules(): Type<unknown>[] {
  const role = process.env.SERVER_ROLE ?? 'all'; // 'all' | 'chat' | 'core'

  if (role === 'chat') {
    // 🟢 SERVIDOR ACTUAL: Solo enciende el WebSocket de Chat
    // (ChatModule importa internamente lo mínimo de Auth y Files para validar sesión y adjuntos)
    return [ChatModule];
  }

  if (role === 'core') {
    // 🔵 SERVIDOR NUEVO: Enciende todos los sistemas de negocio EXCEPTO el Chat
    return [
      AuthModule,
      FilesModule,
      // AttendanceModule,
      // CorrespondenceModule,
      // SignaturesModule,
      // TrainingModule,
    ];
  }

  // Por defecto (en tu PC de desarrollo): enciende todo junto
  return [AuthModule, FilesModule, ChatModule];
}

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    EventEmitterModule.forRoot(),
    ThrottlerModule.forRoot({
      throttlers: [{ ttl: 60_000, limit: 120 }],
      skipIf: () => process.env.DISABLE_THROTTLE === 'true',
    }),
    PrismaModule,
    ...getActiveModules(),
  ],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
```

### Paso 2: Qué pones en el `.env` de cada servidor

- **En el Servidor 1 (Actual - Solo Mensajería):**
  ```env
  SERVER_ROLE=chat
  PORT=3001
  DATABASE_URL=postgresql://sisdoc:clave@10.0.0.50:5432/sisdoc
  JWT_ACCESS_SECRET=el-mismo-secreto-de-32-caracteres-en-ambos
  ```
- **En el Servidor 2 (Nuevo - Resto de Sistemas):**
  ```env
  SERVER_ROLE=core
  PORT=3000
  DATABASE_URL=postgresql://sisdoc:clave@10.0.0.50:5432/sisdoc
  JWT_ACCESS_SECRET=el-mismo-secreto-de-32-caracteres-en-ambos
  ```

### Paso 3: Configurar Nginx para que el usuario no note que son 2 servidores
En tu Nginx pones 2 bloques `location`. Así las cookies `HttpOnly` (`__Host-sisdoc_at`) viajan automáticamente a ambos servidores porque para el navegador todo sigue siendo el mismo dominio (`https://sisdoc.tuempresa.gob.bo`):

```nginx
server {
    listen 443 ssl;
    server_name sisdoc.tuempresa.gob.bo;

    # 1. Todo el tráfico WebSocket de Mensajería va al SERVIDOR ACTUAL (10.0.0.10:3001)
    location /socket.io/ {
        proxy_pass http://10.0.0.10:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    # 2. Todo el resto de sistemas (/api/v1/auth, /documents, /attendance...) va al SERVIDOR NUEVO (10.0.0.20:3000)
    location /api/v1/ {
        proxy_pass http://10.0.0.20:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}
```

---

## 🔥 Forma 2: Separación Total en Microservicios (Cuando quieres llevarte la carpeta `src/modules/chat` a otro proyecto y otra Base de Datos)

Supongamos que vas un paso más allá y dices:
> *"No quiero que el servidor de Mensajería tenga ni siquiera el código de `FilesModule`, ni acceso a las tablas de documentos. Quiero copiar solo la carpeta `src/modules/chat` a un servidor totalmente aislado."*

En un sistema mal hecho (sin Arquitectura Hexagonal), hacer esto te tomaría semanas porque tendrías que reescribir todos los casos de uso de `chat`.

**Mira lo que pasa en tu proyecto actual de SisDoc gracias a que está en Hexagonal:**

### 1. Revisa [`src/modules/chat/application/send-message.use-case.ts`](file:///c:/sistemas/sisdoc/backend/src/modules/chat/application/send-message.use-case.ts)
Tu caso de uso **no sabe que `FilesModule` existe**. Solo conoce su propio puerto `DOCUMENTS_PORT`:
```typescript
@Inject(DOCUMENTS_PORT) private readonly documents: DocumentsPort
```

### 2. Revisa [`src/modules/chat/infrastructure/files-documents.adapter.ts`](file:///c:/sistemas/sisdoc/backend/src/modules/chat/infrastructure/files-documents.adapter.ts)
Hoy tienes este adaptador que llama a `FilesModule` en memoria:
```typescript
// Adaptador actual (cuando viven en el mismo código)
@Injectable()
export class FilesDocumentsAdapter implements DocumentsPort {
  constructor(@Inject(DOCUMENTS_API) private readonly files: DocumentsApi) {}
  // ...
}
```

### 3. ¿Qué es lo ÚNICO que cambias para que hablen entre dos servidores distintos por HTTP?
Creas un nuevo adaptador de 25 líneas en `src/modules/chat/infrastructure/http-files-documents.adapter.ts` que implementa el **mismo puerto `DocumentsPort`**, pero en vez de llamar en memoria, hace un `fetch()` interno al Servidor 2:

```typescript
// src/modules/chat/infrastructure/http-files-documents.adapter.ts
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentsPort, MessageAttachment } from '../domain/ports';

/**
 * Adaptador para cuando Chat vive en el Servidor 1 y Files vive en el Servidor 2.
 * Implementa el MISMO puerto DocumentsPort, así que SendMessageUseCase no se toca.
 */
@Injectable()
export class HttpFilesDocumentsAdapter implements DocumentsPort {
  private readonly filesServerUrl: string;
  private readonly internalSecret: string;

  constructor(config: ConfigService) {
    this.filesServerUrl = config.getOrThrow<string>('FILES_SERVER_INTERNAL_URL'); // ej. http://10.0.0.20:3000
    this.internalSecret = config.getOrThrow<string>('INTERNAL_SERVICE_SECRET');
  }

  async resolveAttachment(input: { documentId: string; versionId?: string; userId: string }): Promise<MessageAttachment> {
    const res = await fetch(`${this.filesServerUrl}/api/v1/internal/files/attachable`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Internal-Secret': this.internalSecret },
      body: JSON.stringify(input),
    });
    if (!res.ok) throw new Error('No se pudo validar el adjunto en el servidor de archivos');
    return res.json();
  }

  async shareWithRecipients(i: {
    attachment: MessageAttachment; senderId: string; recipientIds: string[]; conversationId: string;
  }): Promise<void> {
    await fetch(`${this.filesServerUrl}/api/v1/internal/files/share`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Internal-Secret': this.internalSecret },
      body: JSON.stringify({
        documentId: i.attachment.documentId,
        versionId: i.attachment.versionId,
        sharedById: i.senderId,
        recipientIds: i.recipientIds,
        channel: `chat:${i.conversationId}`,
      }),
    });
  }
}
```

### 4. Y cambias UNA sola línea en [`src/modules/chat/chat.module.ts`](file:///c:/sistemas/sisdoc/backend/src/modules/chat/chat.module.ts#L16):

```diff
 @Module({
-  imports: [FilesModule, AuthModule],
+  imports: [AuthModule], // Ya ni siquiera necesitamos importar FilesModule
   providers: [
     SendMessageUseCase, ChatGateway,
     { provide: CONVERSATION_REPOSITORY, useClass: PrismaConversationRepository },
     { provide: MESSAGE_REPOSITORY, useClass: PrismaMessageRepository },
-    { provide: DOCUMENTS_PORT, useClass: FilesDocumentsAdapter },
+    { provide: DOCUMENTS_PORT, useClass: HttpFilesDocumentsAdapter },
   ],
 })
 export class ChatModule {}
```

---

## 💡 La Gran Lección de Arquitectura que Acabas de Ver

Fíjate en lo que ocurrió al mover los módulos a otro servidor:
1. **¿Cuántas líneas cambiaste en `SendMessageUseCase`?** **CERO.**
2. **¿Cuántas líneas cambiaste en `ChatGateway`?** **CERO.**
3. **¿Cuántas líneas cambiaste en `domain/ports.ts`?** **CERO.**
4. **¿Por qué en `prisma/schema.prisma` (línea 308) `MessageAttachment.documentId` NO tenía Foreign Key hacia `Document`?**
   ¡Justamente por esto! Como no hay clave foránea que ate la tabla `message_attachments` con la tabla `documents`, puedes llevarte las 3 tablas de `chat` (`conversations`, `conversation_members`, `messages`, `message_attachments`) a otra base de datos en otro servidor mañana mismo sin que PostgreSQL te lo impida.

---

## 🗄️ ¿Y Cómo Escribe el Servidor 2 en la Base de Datos? (Los 2 Escenarios)

Cuando tienes dos servidores (Servidor 1 para Mensajería y Servidor 2 para el resto de sistemas), hay **dos formas** de manejar la base de datos PostgreSQL:

---

### Escenario A: Una sola Base de Datos PostgreSQL compartida por red privada (El más sencillo)

PostgreSQL está diseñado para que varios servidores Node.js se conecten a él al mismo tiempo por red (`TCP/IP`, puerto `5432`). Supongamos que PostgreSQL está instalado en el **Servidor 1 (`10.0.0.10`)** y tu **Servidor 2 (`10.0.0.20`)** necesita leer y escribir ahí:

```mermaid
flowchart TB
    subgraph S1["Servidor 1 (10.0.0.10) - Mensajería + PostgreSQL"]
        ChatApp["NestJS (ChatModule)"]
        PG[("PostgreSQL :5432\nBase de datos 'sisdoc'")]
    end

    subgraph S2["Servidor 2 (10.0.0.20) - Auth, Archivos, Asistencia"]
        CoreApp["NestJS (Auth, Files, Attendance...)"]
    end

    ChatApp -->|"localhost:5432\nEscribe en: messages, conversations"| PG
    CoreApp -->|"Red privada 10.0.0.10:5432\nEscribe en: users, documents, attendance"| PG
```

#### ¿Cómo lo configuras paso a paso?
1. **En el `.env` del Servidor 1 (donde vive PostgreSQL):**
   ```env
   DATABASE_URL="postgresql://sisdoc:clave_segura@localhost:5432/sisdoc?schema=public&connection_limit=15"
   ```
2. **En el `.env` del Servidor 2 (se conecta por la IP privada del Servidor 1):**
   ```env
   DATABASE_URL="postgresql://sisdoc:clave_segura@10.0.0.10:5432/sisdoc?schema=public&connection_limit=25"
   ```
3. **Permiso en PostgreSQL del Servidor 1 (para que acepte la conexión del Servidor 2):**
   - En `postgresql.conf`:
     ```ini
     listen_addresses = 'localhost, 10.0.0.10'
     ```
   - En `pg_hba.conf` (autorizas **únicamente** la IP del Servidor 2):
     ```text
     host    sisdoc    sisdoc    10.0.0.20/32    scram-sha-256
     ```
4. **¿Se pisan al escribir?**
   **No**, porque cada módulo es dueño de sus propias tablas:
   - El **Servidor 1 (`ChatModule`)** solo escribe en `conversations`, `conversation_members`, `messages` y `message_attachments`.
   - El **Servidor 2 (`Core`)** escribe en `users`, `sessions`, `devices`, `documents`, `document_versions`, `document_shares`, `document_access_logs`, etc.

---

### Escenario B: Cada Servidor tiene su propio PostgreSQL independiente (Cero contacto directo de BD)

Si prefieres que el **Servidor 1** tenga su propio PostgreSQL solo para el chat (`sisdoc_chat_db`) y el **Servidor 2** tenga su propio PostgreSQL para todo lo demás (`sisdoc_core_db`), **ningún servidor se conecta a la base de datos del otro**. Cada servidor escribe únicamente en su propio PostgreSQL local (`localhost:5432`):

```mermaid
sequenceDiagram
    autonumber
    participant User as Usuario en el Chat
    participant S1 as Servidor 1 (Chat)<br/>+ BD Chat (Local)
    participant S2 as Servidor 2 (Core)<br/>+ BD Core (Local)

    User->>S1: Envía mensaje por WebSocket con adjunto (documentId)
    S1->>S2: HttpFilesDocumentsAdapter hace POST interno<br/>http://10.0.0.20:3000/api/v1/internal/files/share
    Note over S2: El Servidor 2 escribe en SU propia BD (sisdoc_core_db):<br/>INSERT en document_shares y document_access_logs
    S2-->>S1: Responde 200 OK (Permiso otorgado y auditado)
    Note over S1: El Servidor 1 escribe en SU propia BD (sisdoc_chat_db):<br/>INSERT en messages y message_attachments
    S1-->>User: Emite message:new a la sala de chat
```

- **¿Quién escribe los permisos del documento y la bitácora `document_access_logs`?** El **Servidor 2**, en su propia base de datos, cuando el Servidor 1 se lo pide a través del adaptador HTTP (`HttpFilesDocumentsAdapter`).
- **¿Quién escribe el mensaje y el adjunto (`message_attachments`)?** El **Servidor 1**, en su propia base de datos. Como en [`prisma/schema.prisma`](file:///c:/sistemas/sisdoc/backend/prisma/schema.prisma#L308) `documentId` es solo un `String` sin Foreign Key (`@relation`), el PostgreSQL del Servidor 1 guarda el `documentId` sin necesitar que la tabla `documents` exista en su base de datos.

---

## 🌍 Caso Real Avanzado: 3 Servidores VPS Totalmente Distintos (Con IPs Públicas Distintas y Bases de Datos Separadas)

Si tienes **3 VPS contratados por separado** (incluso en distintos proveedores o países, cada uno con su propia IP pública, su propia RAM, su propio disco y su propio PostgreSQL local):

- **VPS 1 (IP `181.115.10.1` - Subdominio `chat.sisdoc.gob.bo`):** Solo Mensajería (`ChatModule`) + su propio PostgreSQL `db_chat`.
- **VPS 2 (IP `200.87.20.2` - Subdominio `core.sisdoc.gob.bo`):** Login (`AuthModule`), Archivos (`FilesModule`), Firmador (`SignaturesModule`) + su propio PostgreSQL `db_core`.
- **VPS 3 (IP `190.129.30.3` - Subdominio `operaciones.sisdoc.gob.bo`):** Asistencia Frontera Avaroa (`AttendanceModule`), Correspondencia GPS (`CorrespondenceModule`), Encuestas (`TrainingModule`) + su propio PostgreSQL `db_operaciones` y Redis.

```mermaid
flowchart TB
    subgraph Internet["DNS Público (Subdominios)"]
        App["Frontend Web / App Móvil"]
    end

    subgraph VPS1["VPS 1 (IP: 181.115.10.1)\nchat.sisdoc.gob.bo"]
        N1["NestJS: Solo ChatModule"]
        DB1[("PostgreSQL Local (127.0.0.1)\nTablas: conversations, messages")]
        N1 --> DB1
    end

    subgraph VPS2["VPS 2 (IP: 200.87.20.2)\ncore.sisdoc.gob.bo"]
        N2["NestJS: Auth + Files + Signatures"]
        DB2[("PostgreSQL Local (127.0.0.1)\nTablas: users, sessions, documents")]
        N2 --> DB2
    end

    subgraph VPS3["VPS 3 (IP: 190.129.30.3)\noperaciones.sisdoc.gob.bo"]
        N3["NestJS: Attendance (Avaroa) + Tracking + Surveys"]
        DB3[("PostgreSQL Local (127.0.0.1)\nTablas: attendance, dispatches, surveys")]
        N3 --> DB3
    end

    App -->|"WebSockets Chat"| VPS1
    App -->|"HTTPS Login y Archivos"| VPS2
    App -->|"HTTPS Asistencia y Mapa GPS"| VPS3

    N1 -.->|"Petición HTTPS Interna (Adaptador)\nPOST https://core.sisdoc.gob.bo/api/v1/internal/files/share"| N2
```

### 1. ¿Cómo escribe un VPS en la base de datos de otro VPS si PostgreSQL NO está abierto a internet?
**Regla de oro de seguridad:** **Jamás** abras el puerto `5432` de PostgreSQL a internet entre distintos VPS. Cada PostgreSQL escucha únicamente en `127.0.0.1` dentro de su propio VPS.

Entonces, ¿cómo se escribe la información cuando el **VPS 1 (Chat)** necesita dar permiso de descarga de un archivo que vive en la base de datos del **VPS 2 (Core)**?

1. **Cada VPS es el único que escribe en su propio PostgreSQL.**
2. En el **VPS 2 (Core)** expones un controlador interno protegido por una clave secreta de servidor a servidor (`X-Internal-Secret`):

```typescript
// En el VPS 2: src/modules/files/presentation/internal-files.controller.ts
@Controller('internal/files')
export class InternalFilesController {
  constructor(
    @Inject(DOCUMENTS_API) private readonly filesApi: DocumentsApi,
    private readonly config: ConfigService,
  ) {}

  private checkSecret(secret?: string) {
    if (!secret || secret !== this.config.getOrThrow('INTERNAL_VPS_SECRET')) {
      throw new ForbiddenError('Acceso interno no autorizado');
    }
  }

  @Post('attachable')
  getAttachable(
    @Headers('x-internal-secret') secret: string,
    @Body() body: { documentId: string; versionId?: string; userId: string },
  ) {
    this.checkSecret(secret);
    // El VPS 2 lee de SU propio PostgreSQL local
    return this.filesApi.getAttachable(body);
  }

  @Post('share')
  async share(
    @Headers('x-internal-secret') secret: string,
    @Body() body: { documentId: string; versionId: string; sharedById: string; recipientIds: string[]; channel: string },
  ) {
    this.checkSecret(secret);
    // El VPS 2 escribe en SU propio PostgreSQL local (tablas document_shares y document_access_logs)
    await this.filesApi.shareWithUsers(body);
    return { ok: true };
  }
}
```

3. Cuando alguien envía un mensaje con archivo en el **VPS 1 (Chat)**:
   - El **VPS 1** ejecuta `SendMessageUseCase`.
   - El adaptador `HttpFilesDocumentsAdapter` del **VPS 1** llama por `HTTPS` a `https://core.sisdoc.gob.bo/api/v1/internal/files/share` (en el **VPS 2**).
   - El **VPS 2** hace el `INSERT` en su propia base de datos `db_core` y devuelve `200 OK`.
   - El **VPS 1** hace el `INSERT` del mensaje en su propia base de datos `db_chat`.

---

### 2. ¿Cómo saben el VPS 1 y el VPS 3 quién es el usuario logueado si la tabla `sessions` está en el VPS 2?
En tu código actual, la sesión viaja en la cookie `sisdoc_at` (que contiene un JWT firmado con `JWT_ACCESS_SECRET`) y [`AuthenticateRequestUseCase`](file:///c:/sistemas/sisdoc/backend/src/modules/auth/application/authenticate-request.use-case.ts) consulta el puerto `SESSION_REPOSITORY`.

Al tener **3 VPS separados**, haces dos ajustes mínimos:

1. **Compartir la cookie entre subdominios (`chat.sisdoc.gob.bo`, `core.sisdoc.gob.bo`, `operaciones.sisdoc.gob.bo`):**
   En [`auth-cookies.ts`](file:///c:/sistemas/sisdoc/backend/src/modules/auth/presentation/auth-cookies.ts#L24), agregas `domain: '.sisdoc.gob.bo'` (usando el prefijo `__Secure-`). Así, cuando el usuario hace login en el **VPS 2**, su navegador envía automáticamente la cookie tanto al **VPS 1** como al **VPS 3**.
2. **Validar la sesión en el VPS 1 y VPS 3:**
   Como [`AuthenticateRequestUseCase`](file:///c:/sistemas/sisdoc/backend/src/modules/auth/application/authenticate-request.use-case.ts#L17) usa el puerto `@Inject(SESSION_REPOSITORY)`, en el **VPS 1** y **VPS 3** en vez de conectar `PrismaSessionRepository`, conectas un `RemoteCachedSessionRepository`:
   - Primero verifica la firma del JWT localmente (en `0.1 ms`, porque los 3 VPS tienen el mismo `JWT_ACCESS_SECRET`).
   - Consulta al **VPS 2** (`/api/v1/internal/auth/session/:id`) y guarda el estado de la sesión en memoria (o Redis local) durante **30 segundos**.

---

### 3. ¿Qué ganas al tener estos 3 VPS separados con subdominios propios?
- **Independencia total de caídas:** Si el **VPS 1 (`chat.sisdoc.gob.bo`)** se apaga por completo o sufre un ataque, el **VPS 3 (`operaciones.sisdoc.gob.bo`)** sigue recibiendo los marcajes de asistencia en Frontera Avaroa y el mapa GPS sin ninguna interrupción, porque el celular habla directo con la IP del VPS 3.
- **Bases de datos ligeras y aisladas:** Si una consulta pesada o un disco lleno afecta la base de datos del Chat en el VPS 1, la base de datos de Documentos en el VPS 2 y la de Asistencia en el VPS 3 ni se enteran.

