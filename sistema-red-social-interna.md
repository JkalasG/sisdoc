# Sistema de Red Social Interna y Mensajería

Documento de descripción del sistema, arquitectura y stack tecnológico (con su justificación), con énfasis en **notificaciones en tiempo real**.

---

## 1. Descripción general

Plataforma interna que combina:

- **Red social**: publicaciones (texto, imágenes, video), comentarios y reacciones, al estilo Facebook.
- **Mensajería**: chats directos y grupales en tiempo real.
- **Grupos y comunidades**: públicos o privados, con sus propios roles.
- **Panel de administración**: gestión de usuarios, roles, grupos, moderación y auditoría.
- **Notificaciones en tiempo real**: tanto dentro de la app como en el celular, aunque la app esté cerrada.

### Plataformas

| Plataforma | Quién la usa | Cómo se entrega |
|---|---|---|
| Web (navegador) | Administradores y usuarios | Se publica el build en un servidor |
| App móvil (.apk / .aab) | Usuarios | Mismo código web empaquetado con Capacitor |
| iOS (opcional, a futuro) | Usuarios | Mismo código, compilado con Xcode |

**Principio clave:** una sola base de código de frontend para web, APK y panel admin, consumiendo una única API backend.

---

## 2. Requisitos funcionales

### Usuarios
- Registro e inicio de sesión (o SSO corporativo).
- Perfil con foto, datos y estado de presencia (en línea / ausente).
- Feed de publicaciones con comentarios y reacciones.
- Chat directo y grupal, con envío de imágenes y archivos.
- Indicadores de escritura, mensaje entregado y mensaje leído.
- Unirse o crear grupos según permisos.
- Centro de notificaciones y preferencias de notificación.
- Uso de cámara y galería desde el celular.

### Administrador / moderador
- Gestión de usuarios (crear, bloquear, restablecer acceso).
- Gestión de roles y permisos.
- Gestión de grupos y de su contenido.
- Moderación: reportes, eliminación de publicaciones y mensajes.
- Envío de anuncios y notificaciones generales.
- Registro de auditoría de acciones administrativas.
- Reportes y estadísticas de uso.

---

## 3. Requisitos no funcionales

- **Seguridad:** autenticación robusta, autorización por rol/permiso/grupo, cifrado en tránsito (HTTPS/WSS).
- **Tiempo real:** latencia de mensajes y notificaciones menor a 1 segundo con la app abierta.
- **Disponibilidad:** funcionamiento estable con reconexión automática.
- **Escalabilidad:** de decenas a miles de usuarios sin cambiar de tecnología.
- **Mantenibilidad:** un solo lenguaje (TypeScript) y una sola base de código de frontend.
- **Portabilidad:** instalable en servidor propio o VPS, sin dependencia obligatoria de un proveedor.

---

## 4. Arquitectura general

```
┌──────────────────────────────────────────────────────────┐
│                       CLIENTES                           │
│   Web (navegador)        App Android/iOS (Capacitor)     │
│        └────────── mismo código React ──────────┘        │
└───────────────┬───────────────────────┬──────────────────┘
                │ HTTPS (REST)          │ WSS (Socket.IO)
                ▼                       ▼
┌──────────────────────────────────────────────────────────┐
│                  Nginx (proxy + HTTPS)                   │
└───────────────┬──────────────────────────────────────────┘
                ▼
┌──────────────────────────────────────────────────────────┐
│                  BACKEND (NestJS)                        │
│  Auth · Usuarios · Roles · Grupos · Posts · Chat         │
│  Notificaciones · Archivos · Auditoría                   │
│  ┌─────────────────┐   ┌──────────────────────────────┐  │
│  │ API REST        │   │ Gateway WebSocket (Socket.IO)│  │
│  └─────────────────┘   └──────────────────────────────┘  │
└──────┬──────────────┬──────────────┬──────────────┬──────┘
       ▼              ▼              ▼              ▼
  PostgreSQL        Redis          BullMQ     S3 / R2 / MinIO
  (datos)     (presencia, pub/sub) (colas)      (archivos)
                                      │
                                      ▼
                          Firebase Cloud Messaging
                      (push al celular y al navegador)
```

---

## 5. Stack tecnológico y su defensa

### 5.1 Frontend

| Tecnología | Función |
|---|---|
| **React + TypeScript** | Interfaz de usuario |
| **Vite** | Compilador y servidor de desarrollo |
| **Capacitor** | Empaquetado como app nativa (.apk/.aab) |
| **Tailwind CSS + shadcn/ui** | Estilos y componentes |
| **React Router** | Navegación |
| **TanStack Query** | Estado del servidor y caché |
| **Zustand** | Estado global (sesión, UI) |
| **React Hook Form + Zod** | Formularios y validación |
| **socket.io-client** | Comunicación en tiempo real |

**Por qué este conjunto:**

- **React + TypeScript:** ecosistema enorme, abundante talento y librerías. TypeScript evita errores y permite compartir tipos con el backend.
- **Vite en lugar de Next.js:** la plataforma es una red **interna detrás de login**, por lo que no se necesita SEO ni renderizado en servidor. Next.js obligaría a usar exportación estática para generar el APK, perdiendo SSR, API routes y complicando las rutas dinámicas (`/chat/[id]`). Vite genera una SPA estática (`dist/`) que Capacitor empaqueta sin configuraciones especiales.
- **Capacitor:** permite que la misma web sea una app nativa con acceso a cámara, notificaciones push, almacenamiento seguro, etc., sin reescribir nada. Es el equilibrio ideal entre esfuerzo y funcionalidad frente a React Native o Flutter, que exigirían mantener el panel web por separado.
- **TanStack Query:** gestiona caché, paginación infinita del feed y reintentos. Se integra bien con eventos de socket para actualizar datos en vivo.
- **Zustand:** estado global mínimo y sencillo, sin la carga de Redux.

### 5.2 Backend

| Tecnología | Función |
|---|---|
| **NestJS (TypeScript)** | Framework del servidor |
| **REST + Swagger/OpenAPI** | API documentada |
| **Socket.IO** | Tiempo real (chat, notificaciones, presencia) |
| **Prisma** | ORM y migraciones |
| **Passport + JWT** | Autenticación |
| **Argon2** | Hash de contraseñas |
| **class-validator / Zod** | Validación de entradas |
| **Helmet + Throttler** | Cabeceras seguras y límite de peticiones |
| **BullMQ** | Colas de tareas en segundo plano |

**Por qué este conjunto:**

- **NestJS:** trae de serie módulos, inyección de dependencias, **Guards** y decoradores, ideales para implementar roles, permisos y control de acceso por grupo de forma ordenada. Además incluye soporte nativo de WebSockets (Gateways).
- **Socket.IO:** reconexión automática, salas (rooms), confirmaciones (acks) y respaldo por long-polling si el WebSocket falla. Es la opción más madura para chat.
- **Prisma:** tipado fuerte, migraciones claras y buena productividad.
- **Argon2:** algoritmo recomendado actualmente para almacenar contraseñas.
- **BullMQ:** permite enviar notificaciones push y procesar imágenes sin bloquear las peticiones, con reintentos automáticos.

### 5.3 Datos e infraestructura

| Tecnología | Función |
|---|---|
| **PostgreSQL** | Base de datos principal |
| **Redis** | Presencia online, caché, pub/sub y adaptador de Socket.IO |
| **S3 / Cloudflare R2 / MinIO** | Almacenamiento de archivos con URLs firmadas |
| **Firebase Cloud Messaging (FCM)** | Notificaciones push |
| **Docker + Docker Compose** | Despliegue reproducible |
| **Nginx + Let's Encrypt** | Proxy inverso y HTTPS |
| **GitHub Actions** | CI/CD |
| **Sentry + Uptime Kuma** | Monitoreo de errores y disponibilidad |

**Por qué este conjunto:**

- **PostgreSQL:** relacional, ideal para usuarios, roles, grupos y membresías con integridad referencial. Soporta JSON y búsqueda de texto completo cuando se necesite.
- **Redis:** imprescindible para el tiempo real. Guarda quién está conectado, y permite que **varias instancias del backend** compartan eventos de Socket.IO al escalar.
- **Almacenamiento de objetos con URLs firmadas:** las fotos de un grupo privado no son accesibles públicamente; solo quien tiene permiso recibe un enlace temporal.
- **FCM:** gratuito, estable, y es el canal oficial para entregar push a Android y navegadores. Es la única vía fiable de notificar con la app cerrada.
- **Docker:** todo el sistema se levanta con un comando y es portable entre servidores.

---

## 6. Notificaciones en tiempo real (diseño detallado)

Este es un requisito central. Una notificación puede llegar al usuario en tres situaciones distintas, y cada una necesita su propio canal:

| Estado del usuario | Canal | Latencia típica |
|---|---|---|
| App o web **abierta** (en primer plano) | **Socket.IO** (WebSocket) | Milisegundos |
| App en **segundo plano** o **cerrada** (Android/iOS) | **Push nativo vía FCM** | 1 a 3 segundos |
| Navegador web **cerrado o pestaña inactiva** | **Web Push** (Service Worker + FCM) | 1 a 3 segundos |

### 6.1 Flujo de entrega

```
Evento (nuevo mensaje, comentario, reacción, anuncio...)
        │
        ▼
Servicio de Notificaciones (backend)
        │
        ├─ 1. Guarda la notificación en PostgreSQL (historial / bandeja)
        │
        ├─ 2. Consulta en Redis: ¿el usuario está conectado por socket?
        │        │
        │        ├─ SÍ  → emite por Socket.IO a la sala "user:{id}"
        │        │         (aparece al instante en la app abierta)
        │        │
        │        └─ NO  → encola un trabajo en BullMQ
        │                  → worker envía push por FCM
        │                    a todos sus dispositivos registrados
        │
        └─ 3. Respeta preferencias del usuario (silenciado, horarios, tipo)
```

Si el usuario tiene la app abierta en la web y cerrada en el celular, recibe en vivo en la web y push en el celular, según los dispositivos activos.

### 6.2 Componentes técnicos

1. **Salas por usuario:** al conectarse, cada cliente se une a `user:{id}` tras validar su token. Desde cualquier parte del backend se puede emitir una notificación a esa sala.
2. **Presencia con Redis:** se registra cada conexión (con múltiples dispositivos por usuario) y se elimina al desconectarse, con *heartbeat* para detectar caídas.
3. **Registro de dispositivos:** la tabla `push_tokens` guarda el token FCM de cada dispositivo (plataforma, fecha, estado). Los tokens inválidos se eliminan automáticamente cuando FCM responde con error.
4. **Cola BullMQ:** el envío de push se hace en segundo plano, con reintentos y retroceso exponencial, para no ralentizar la API ni perder notificaciones.
5. **Confirmación de recepción (ack):** el cliente confirma con un evento cuando recibe la notificación por socket; si no hay confirmación en unos segundos, el backend puede enviar también push como respaldo.
6. **Contador de no leídas:** se mantiene en Redis y se sincroniza por socket para mostrar globos de notificación actualizados en tiempo real.
7. **Escalado horizontal:** el adaptador de Redis en Socket.IO permite que una notificación emitida en una instancia llegue a un usuario conectado a otra.

### 6.3 Detalles importantes para que sea realmente instantáneo en el celular

- Usar **mensajes FCM de alta prioridad** para chats, de modo que Android los entregue incluso en modo de ahorro de batería (Doze).
- Configurar **canales de notificación** en Android (mensajes, publicaciones, anuncios) para que el usuario controle sonido y vibración.
- **Notificaciones agrupadas** por conversación para no saturar la bandeja.
- Al tocar la notificación, **abrir directamente** el chat o la publicación correspondiente (deep link).
- Al volver a abrir la app, **sincronizar** lo perdido mediante la API (mensajes desde el último ID recibido), así nada se pierde aunque el socket haya estado desconectado.
- En iPhone, las notificaciones usan APNs a través de FCM; en la web de iOS funcionan solo si la app está instalada en la pantalla de inicio (iOS 16.4+).
- **No incluir contenido sensible** en el texto del push si la red lo requiere; se puede mostrar "Nuevo mensaje" y cargar el contenido al abrir.

### 6.4 Tipos de notificación previstos

| Tipo | Ejemplo | Prioridad |
|---|---|---|
| Mensaje directo | "Ana te envió un mensaje" | Alta |
| Mensaje de grupo | "Nuevo mensaje en Proyecto X" | Alta (con opción de silenciar) |
| Mención | "Luis te mencionó en una publicación" | Alta |
| Comentario / reacción | "A Marta le gustó tu publicación" | Normal |
| Solicitud de grupo | "Pedro quiere unirse a tu grupo" | Normal |
| Anuncio del administrador | "Mantenimiento programado" | Alta |
| Alerta de seguridad | "Nuevo inicio de sesión en tu cuenta" | Alta |

---

## 7. Seguridad: autenticación y autorización

### 7.1 Autenticación

- **Access token (JWT)** de corta duración (10 a 15 minutos).
- **Refresh token** de larga duración (7 a 30 días), almacenado **hasheado** en base de datos para poder revocarlo por dispositivo.
- **Almacenamiento seguro:**
  - Web: cookie `httpOnly` + `Secure` + `SameSite`.
  - APK: Keystore/Keychain mediante plugin de almacenamiento seguro (no `localStorage`).
- Contraseñas con **Argon2**.
- **Rate limiting** y bloqueo temporal ante intentos fallidos.
- 2FA opcional (obligatorio para administradores) y opción de SSO (Google Workspace / Microsoft Entra).
- Cierre de sesión remoto: "cerrar todas las sesiones".

### 7.2 Autorización: roles, permisos y grupos

Tres niveles combinados:

1. **Rol global:** `admin`, `moderador`, `usuario`.
2. **Permisos:** acciones concretas (`post.create`, `post.delete_any`, `user.ban`, `group.create`).
3. **Rol dentro del grupo:** `owner`, `admin`, `member`, independiente del rol global.

**Regla de oro:** la seguridad se valida siempre en el backend. El frontend solo oculta botones y rutas para mejorar la experiencia.

En cada endpoint y en cada evento de socket se verifica:
1. Que el token es válido.
2. Que el usuario tiene el permiso requerido.
3. Que pertenece al grupo o conversación, o es dueño del recurso.

### 7.3 Seguridad en tiempo real

- Autenticar la conexión WebSocket al conectar (token en el *handshake*).
- Revalidar la pertenencia al unirse a cada sala (conversación o grupo).
- Expulsar de las salas a quien sea removido de un grupo o bloqueado, **de inmediato**.
- Conexión siempre por **WSS** (WebSocket cifrado).
- Límite de eventos por segundo por conexión para evitar abusos (spam o flood).

### 7.4 Otras medidas

- URLs firmadas con expiración para archivos privados.
- Validación estricta de tipo y tamaño de archivos subidos.
- CORS restringido, cabeceras seguras con Helmet.
- Registro de auditoría de acciones administrativas.
- Copias de seguridad automáticas y probadas.

---

## 8. Modelo de datos (base)

```
users                  (id, nombre, email, password_hash, activo, avatar, ...)
roles                  (id, nombre)
permissions            (id, codigo)
role_permissions       (role_id, permission_id)
user_roles             (user_id, role_id)

groups                 (id, nombre, descripcion, privado, ...)
group_members          (group_id, user_id, rol_grupo, estado)

posts                  (id, autor_id, group_id NULL, contenido, visibilidad, ...)
post_media             (id, post_id, url, tipo)
comments               (id, post_id, autor_id, contenido, ...)
reactions              (id, user_id, target_tipo, target_id, tipo)

conversations          (id, tipo)            -- directo / grupo
conversation_members   (conversation_id, user_id, ultimo_leido)
messages               (id, conversation_id, autor_id, contenido, tipo, creado_en)

notifications          (id, user_id, tipo, titulo, cuerpo, data JSON, leida, creada_en)
notification_prefs     (user_id, tipo, canal, silenciado, horario)
push_tokens            (id, user_id, token, plataforma, ultimo_uso)

refresh_tokens         (id, user_id, token_hash, dispositivo, expira, revocado)
reports                (id, reportante_id, target_tipo, target_id, motivo, estado)
audit_logs             (id, user_id, accion, detalle, fecha)
```

---

## 9. Estructura del proyecto

```
proyecto/
├── frontend/                 → Vite + React + Capacitor
│   ├── src/
│   │   └── features/
│   │       ├── auth/
│   │       ├── feed/         (publicaciones)
│   │       ├── chat/
│   │       ├── groups/
│   │       ├── notifications/
│   │       └── admin/        (visible solo para rol admin)
│   ├── android/              → generado por Capacitor
│   └── dist/                 → build web
├── backend/                  → NestJS
│   └── src/modules/
│       ├── auth/ users/ roles/ groups/
│       ├── posts/ chat/ notifications/
│       └── files/ audit/
├── docker-compose.yml        → postgres, redis, backend, nginx
└── .github/workflows/
```

El **panel de administración** vive dentro del mismo frontend (ruta `/admin` protegida por rol). Si más adelante crece mucho, puede separarse en un proyecto propio.

---

## 10. Generación del APK

```bash
cd frontend
npm install @capacitor/core @capacitor/cli @capacitor/android
npx cap init MiApp com.tuempresa.app --web-dir dist
npm run build
npx cap add android
npx cap sync
npx cap open android
```

En Android Studio: **Build → Build Bundle(s) / APK(s) → Build APK(s)**.

- **APK:** pruebas y distribución interna.
- **AAB firmado:** necesario para publicar en Google Play.
- Tras cada cambio: `npm run build` y `npx cap sync`.

Plugins nativos principales: `@capacitor/push-notifications`, `@capacitor/camera`, `@capacitor/filesystem`, almacenamiento seguro y `@capacitor/app` (deep links).

---

## 11. Alternativas consideradas

| Alternativa | Motivo de descarte |
|---|---|
| **Next.js para todo** | No se necesita SSR/SEO; complica el APK con exportación estática y rutas dinámicas. |
| **React Native / Flutter** | Exigen mantener el panel web separado de la app móvil; más código y más tiempo. |
| **PWA únicamente** | Notificaciones y acceso nativo más limitados, sobre todo en iOS; sin presencia fuerte en tiendas. |
| **Firebase / Supabase como backend completo** | Menos control sobre permisos complejos por grupo y moderación; dependencia de proveedor. Válido para un prototipo rápido. |
| **Firestore para notificaciones en vivo** | Costos que crecen con las lecturas y menor control; Socket.IO + Redis es más predecible. |

---

## 12. Plan por fases

| Fase | Contenido |
|---|---|
| **1. Base** | Docker, backend NestJS, PostgreSQL, autenticación, roles y permisos |
| **2. Núcleo social** | Perfiles, grupos, publicaciones, comentarios y reacciones |
| **3. Chat en tiempo real** | Conversaciones directas y grupales, presencia, escritura, leído/entregado |
| **4. Notificaciones** | Socket.IO en vivo, FCM, Web Push, preferencias, bandeja de notificaciones |
| **5. Móvil** | Capacitor, APK, cámara, push nativo, deep links |
| **6. Administración** | Panel admin, moderación, reportes, auditoría |
| **7. Producción** | Nginx, HTTPS, backups, monitoreo, pruebas de carga |

---

## 13. Costos iniciales aproximados

| Concepto | Costo |
|---|---|
| VPS (backend, base de datos, Redis) | 5 a 20 USD/mes |
| Google Play Console | 25 USD (pago único) |
| Apple Developer (solo si se hace iOS) | 99 USD/año |
| Firebase Cloud Messaging | Gratis |
| Dominio | 10 a 15 USD/año |

---

## 14. Conclusión

El stack **React + Vite + Capacitor** (frontend), **NestJS + Socket.IO + PostgreSQL + Redis** (backend) y **Firebase Cloud Messaging** (push) cubre todos los requisitos:

- Una sola base de código para web, APK y panel admin.
- Seguridad sólida con roles, permisos y grupos validados en el servidor.
- **Notificaciones verdaderamente en tiempo real**, combinando WebSocket (app abierta) y push nativo (app cerrada), con sincronización para no perder ningún evento.
- Tecnología abierta, escalable y desplegable en un servidor propio sin dependencia obligatoria de terceros.
