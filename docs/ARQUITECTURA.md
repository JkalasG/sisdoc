# Arquitectura – Monolito modular + Arquitectura limpia

## 1. ¿Monolito o microservicios?

**Ninguno de los dos extremos: monolito modular.**

- **Un solo despliegue** (un solo proceso NestJS, una sola BD). Simple de instalar, depurar y operar con un equipo pequeño.
- **Módulos con fronteras estrictas.** Cada módulo (`files`, `chat`, `notifications`, ...) es dueño de sus tablas, su lógica y su API pública. Nadie toca el interior de otro módulo.
- **Camino de salida.** Si algún día `files` o `notifications` necesitan escalar aparte, se extraen como servicio porque ya están aislados. Se paga ese costo solo cuando hace falta.

> El "monolito" malo es el que mezcla todo (el controlador de chat consulta tablas de archivos). El modular evita eso por diseño.

## 2. Arquitectura limpia dentro de cada módulo

Cuatro capas. **Las dependencias solo apuntan hacia adentro.**

```
presentation  →  application  →  domain  ←  infrastructure
(controllers,    (casos de uso)   (reglas,    (Prisma, S3, Redis)
 gateways, DTOs)                   puertos)
```

| Capa | Contiene | Puede importar |
|---|---|---|
| **domain** | Entidades, reglas de negocio puras (`hasPermission`), **puertos** (interfaces) | Nada externo |
| **application** | Casos de uso (`UploadDocumentUseCase`) que orquestan dominio y puertos | domain |
| **infrastructure** | **Adaptadores** que implementan los puertos: Prisma, S3, Redis | domain, librerías |
| **presentation** | Controladores REST, gateways Socket.IO, DTOs | application |

Reglas que evitan problemas:
1. `@prisma/client` solo aparece en `infrastructure/`. Cambiar de ORM o de S3 a otro storage no toca el dominio.
2. El módulo (`*.module.ts`) es el único lugar donde se conecta puerto → adaptador.
3. Los casos de uso se prueban con repositorios falsos, sin base de datos.
4. Un caso de uso = una acción de negocio.

## 3. Reglas entre módulos

1. Un módulo solo importa de otro su **`*.public-api.ts`** (interfaz + token de inyección).
2. El módulo exporta únicamente esa API pública (`exports: [DOCUMENTS_API]`).
3. No hay claves foráneas entre módulos (`message_attachments.document_id` es un ID lógico). Así se puede separar la BD en el futuro.
4. El consumidor define un **puerto propio** y una **capa anticorrupción**: chat define `DocumentsPort` y lo implementa `FilesDocumentsAdapter`, que traduce a la API de files.
5. Para reaccionar sin acoplar usa **eventos**: chat emite `chat.message.sent`; notificaciones escucha. Chat no sabe que existe notificaciones.

## 4. Cómo conviven Archivos y Mensajería

### Responsabilidades

| Módulo `files` | Módulo `chat` |
|---|---|
| Guardar archivos y sus **versiones** | Conversaciones y mensajes |
| Permisos, revisiones, estados | Tiempo real (Socket.IO), leído/entregado |
| **Bitácora de trazabilidad** | **No guarda archivos**: solo referencia `documentId + versionId` |

### Flujo: enviar un documento por chat

```
1. Usuario sube el archivo      → POST /documents            (módulo files)
                                   crea Documento + Versión 1, log UPLOAD
2. Usuario envía el mensaje     → WS message:send {content, attachments:[{documentId}]}
3. SendMessageUseCase (chat)
     a. Verifica que el autor es miembro de la conversación
     b. DocumentsPort.resolveAttachment → files comprueba que puede compartirlo
        y devuelve la versión exacta
     c. Guarda el mensaje con la referencia (documentId, versionId)
     d. DocumentsPort.shareWithRecipients → files da permiso DOWNLOAD a los
        miembros y registra SHARE con canal "chat:<conversationId>"
     e. Emite evento chat.message.sent → notificaciones
4. Destinatario pulsa el adjunto → GET /documents/:id/download
     files valida permiso → registra DOWNLOAD → devuelve URL firmada (60 s)
```

Un documento enviado por chat sigue siendo **un solo documento** con una sola historia, no una copia dentro del chat.

## 5. Modelo documental

```
Document ──┬─< DocumentVersion   (v1, v2, v3 … inmutables, con hash SHA-256)
           ├─< DocumentShare     (usuario + permiso VIEW/DOWNLOAD/EDIT + expiración)
           ├─< DocumentReview    (revisor, versión revisada, decisión, comentario)
           └─< DocumentAccessLog (bitácora append-only)
```

### Revisiones (versionado)
- Cada subida crea una **nueva versión**; las anteriores nunca se modifican ni se borran.
- `current_version_id` apunta a la vigente.
- El número de versión se calcula dentro de una transacción y lo protege `UNIQUE(document_id, version_number)`.
- Se guarda `change_note` ("qué cambió") y el **hash SHA-256** para demostrar que el archivo no fue alterado.

### Flujo de aprobación
```
DRAFT → (solicitar revisión) → IN_REVIEW → APPROVED
                                         → REJECTED
                                         → CHANGES_REQUESTED → vuelve a DRAFT (nueva versión)
```
Solo el revisor asignado puede decidir; cada paso queda en la bitácora.

### Trazabilidad e historial de descargas
Tabla `document_access_logs`, **solo inserción**: quién, qué versión, cuándo, desde qué IP/dispositivo y por qué canal (`files` o `chat:<id>`).

Acciones: `UPLOAD, NEW_VERSION, VIEW, DOWNLOAD, SHARE, UNSHARE, REVIEW_REQUESTED, REVIEW_DECIDED, STATUS_CHANGED, DELETE, RESTORE`.

Consultas típicas: historial por documento (`GET /documents/:id/history`), descargas por usuario, descargas por versión, quién tuvo acceso en un rango de fechas.

Garantías de diseño:
- **Se registra antes de entregar la URL.** Si falla el log, no hay descarga.
- La URL firmada vive 60 s, así que una URL filtrada caduca casi de inmediato.
- Borrado **lógico** (`deleted_at`): un documento "eliminado" conserva su traza.
- Para endurecerlo en producción: crear en PostgreSQL un rol de aplicación **sin** `UPDATE/DELETE` sobre `document_access_logs`.

### Seguridad de archivos
- En el storage el nombre es un UUID (`documents/<id>/<uuid>`), nunca el original.
- Validación de tipo MIME (lista blanca) y tamaño máximo. Mejora futura: validar firma real del archivo y antivirus (ClamAV) en una cola BullMQ.
- Bucket privado; acceso solo por URL firmada tras validar permisos.

## 6. Cómo agregar un módulo nuevo (ejemplo: `notifications`)

1. `modules/notifications/{domain,application,infrastructure,presentation}`.
2. Definir sus puertos en `domain/` y sus casos de uso.
3. Escuchar eventos (`@OnEvent('chat.message.sent')`) en lugar de llamar a chat.
4. Si otros módulos lo necesitan: crear `notifications.public-api.ts` y exportar solo eso.
5. Registrar en `app.module.ts`.

## 7. Pendiente / decisiones abiertas

- Reemplazar `DevAuthGuard` por JWT (Fase 1). Los controladores no cambian.
- Aún no implementado en `files`: listar/buscar documentos, `GET /documents/:id` con registro `VIEW`, compartir manual, borrado lógico y reportes de descargas. El modelo de datos ya los soporta.
- El parámetro `channel` de descarga hoy se fija a `files`; para registrar descargas desde chat hay que pasar el canal desde un endpoint propio de chat (no desde un parámetro que el cliente pueda falsear).
- Verificación de pertenencia al unirse a salas en el gateway (Fase 3).
