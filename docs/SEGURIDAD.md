# Diseño de seguridad – SisDoc

Estado: **BORRADOR PARA REVISIÓN**. Nada de esto está implementado todavía.
Las decisiones marcadas con ❓ necesitan tu respuesta (ver sección 9).

## 0. Contexto de carga

- Hoy: 30 usuarios registrados, ~15 conectados a la vez. **El sistema debe poder crecer** y no sentirse lento al aumentar usuarios.
- Decisión: se diseña **escalable desde el día 1** (aunque se arranque con una sola instancia). Lo que cuesta poco ahora y duele después:

| Aspecto | Decisión de diseño |
|---|---|
| Backend **sin estado** | Ninguna sesión ni dato en memoria del proceso. Se pueden poner N instancias detrás de Nginx sin cambiar código. |
| Validación de sesión por petición | **No** consulta PostgreSQL cada vez: se verifica la firma del JWT y se consulta un registro de sesión en **Redis** (microsegundos). PostgreSQL es la fuente de verdad; Redis, la caché. |
| Permisos / alcance (rol, grupo, sección) | Se cargan una vez y se cachean en Redis (~60 s); se **invalidan al instante** por pub/sub cuando un admin los cambia. |
| `lastActivityAt` | No se escribe en BD en cada petición: se actualiza en Redis y se vuelca a BD como máximo 1 vez/minuto. |
| Argon2 (costoso en CPU) | Solo se usa en login/cambio de contraseña, con límite de concurrencia para que una ráfaga de logins no congele la API. |
| Socket.IO | **Adaptador Redis desde el inicio**: otra instancia del backend puede entregar mensajes a usuarios conectados a otra. |
| Auditoría | Escritura **asíncrona por lotes** (cola BullMQ) salvo eventos críticos; tablas particionadas por mes e indexadas. |
| Consultas | Paginación por cursor, índices en todas las claves de filtro de alcance, sin N+1. |
| Base de datos | Pool de conexiones (PgBouncer más adelante), réplica de lectura si hiciera falta. |

Con esto, pasar de 30 a cientos de usuarios es agregar instancias, no reescribir.

## 1. Principios

1. **Denegar por defecto.** Si ninguna regla permite algo explícitamente, se niega.
2. **La seguridad vive en el backend.** El frontend solo oculta botones.
3. **Capas combinadas con AND.** Para acceder a un recurso deben cumplirse las capas aplicables (rol, sección, grupo, usuario), no basta una.
4. **Lo ajeno no existe.** Si no tienes acceso a un recurso, la API responde **404**, no 403, para no revelar que existe.
5. **El filtro va en la consulta**, no después. Los repositorios reciben el contexto del actor y filtran en SQL; nunca se traen datos ajenos "para filtrar luego".
6. **Toda acción se audita**: quién (usuario), qué (acción y recurso), cuándo (fecha/hora UTC) y desde dónde (IP, dispositivo). Ver sección 5.1.
7. **Mensajes de error genéricos** en autenticación (no revelar si el usuario existe).

## 2. Los 4 niveles de autorización

| Nivel | Responde a… | Ejemplo |
|---|---|---|
| **1. Usuario** | ¿Quién eres y estás habilitado? Excepciones y propiedad de recursos | `jperez`, activo, dueño de su documento |
| **2. Rol** | ¿Qué *acciones* puedes hacer? | `ADMIN`, `MODERADOR`, `USUARIO` → permisos `document.upload`, `user.ban` |
| **3. Grupo** | ¿A qué *espacios de colaboración* perteneces? | Grupo "Proyecto X": chat y archivos compartidos |
| **4. Sección** | ¿A qué *área o departamento* perteneces / qué *datos* ves? | Sección "Contabilidad" |

> ✅ **Sección = área / departamento de la organización** (confirmado).

### 2.0 Jerarquía confirmada

```
Sección (departamento)
   └── Grupo            (cada grupo pertenece a UNA sección)
         └── Miembro    (usuario + rol dentro del grupo: owner / admin / member)
```

- Un **rol de grupo** (`owner`, `admin`, `member`) solo vale **dentro de ese grupo**; no da poder en otros grupos.
- Aparte existe el **rol global** (`ADMIN`, `AUDITOR`, `USUARIO`…) que define las acciones permitidas en todo el sistema (nivel 2).
- ❓ P11: ¿el usuario también pertenece a su sección **directamente** (es de Contabilidad aunque no esté en ningún grupo), o solo a través de sus grupos? Recomiendo **directo** (un usuario tiene una sección principal) y además la heredada por los grupos.

### 2.1 Cómo se evalúa una petición

```
Petición → [Autenticación] ¿sesión válida y usuario activo?         → 401
         → [Rol]           ¿algún rol del usuario tiene el permiso?  → 403 (acción)
         → [Sección/Grupo] ¿el recurso está en mi sección o grupo?   → 404 (dato ajeno)
         → [Usuario]       ¿soy dueño, o tengo permiso explícito?    → 404/403
         → ejecutar caso de uso
```

Permisos: formato `recurso.acción` (`document.download`, `group.create`, `user.disable`).
Un rol es solo una **lista de permisos**; el código nunca pregunta "¿es admin?", pregunta "¿tiene `user.disable`?".

### 2.2 Alcance de datos (lo que evita ver información ajena)

Cada recurso declara **a quién pertenece**:

| Recurso | Visible para |
|---|---|
| Mensaje / conversación | Solo miembros de la conversación |
| Documento | Dueño + usuarios con `DocumentShare` vigente (+ auditor con permiso específico) |
| Contenido de un grupo | Solo miembros del grupo |
| Contenido de una sección | Miembros de esa sección (❓ P2) |
| Perfil de usuario | Datos básicos para todos los autenticados; datos sensibles solo con `user.read_all` |
| Bitácora de auditoría | Solo rol con `audit.read` |

## 3. Nivel 1 – Autenticación: usuario y contraseña

### 3.1 Reglas de contraseña
- Mínimo **12 caracteres** (la longitud pesa más que la complejidad). Máximo 128.
- Rechazar las más comunes (lista de las 10 000 peores) y las que contengan el nombre de usuario.
- **No** se fuerza rotación periódica (NIST); sí se fuerza el cambio en el primer inicio de sesión y tras un reinicio por admin.
- Historial: no reutilizar las últimas 5.
- Hash: **Argon2id** (`memoryCost 19 MiB, timeCost 2, parallelism 1` como mínimo; se ajusta al servidor). Nunca se guarda ni se registra la contraseña en claro.

### 3.2 Protección contra ataques
| Amenaza | Medida |
|---|---|
| Fuerza bruta | 5 intentos fallidos → bloqueo de la cuenta 15 min (progresivo: 15 → 30 → 60). Además límite por IP (10 intentos/min). |
| Enumeración de usuarios | Misma respuesta y mismo tiempo para "usuario no existe" y "contraseña errónea" (se hace un hash falso cuando el usuario no existe). |
| Robo de la BD | Argon2id; los refresh tokens se guardan **hasheados** (SHA-256). |
| Credenciales filtradas | Aviso de cambio, y cierre de todas las sesiones al cambiar contraseña. |
| Contraseña por defecto | `must_change_password = true` en usuarios creados por admin. |

### 3.2.1 Login con Google (además de correo + contraseña)

Se usa OpenID Connect (flujo de código con PKCE). Reglas de seguridad:
- **No hay auto-registro**: solo entra con Google quien **ya fue creado por un admin** con ese correo. Una cuenta Google cualquiera no obtiene acceso.
- Se exige `email_verified = true` y, si la organización usa Google Workspace, se restringe al dominio (`hd`) de la empresa.
- El vínculo se hace por `sub` de Google (estable), no solo por el correo.
- Primer ingreso con Google: se vincula el `sub` al usuario existente con ese correo y se audita (`GOOGLE_LINKED`).
- Un usuario deshabilitado, bloqueado o fuera de IP permitida **no entra por Google tampoco**: se aplican las mismas políticas, y se crea la misma sesión (cookies, 30 min / 12 h, máx. 3).
- El usuario puede tener solo Google, solo contraseña o ambos (`passwordHash` nullable). Quitar Google a un usuario revoca sus sesiones.
- **P16 decidido: Google es "acceso rápido", no reemplaza a la contraseña.** Tiene un **interruptor de control** para habilitarlo: global (todo el sistema), por rol y por usuario (`googleLoginEnabled`). Si está apagado para alguien, el botón de Google no le funciona. El acceso rápido sigue sujeto a todo lo demás: dispositivo aprobado, límite de 3 sesiones, bloqueo geográfico, IP y estado del usuario.

### 3.3 Flujos
1. **Alta de usuario**: solo un administrador (con permiso `user.create`). No hay auto-registro. Se genera una contraseña temporal que se muestra una vez.
2. **Primer login**: login → el servidor responde `mustChangePassword: true` → solo se permite `POST /auth/change-password` hasta cambiarla.
3. **Login normal**: usuario + contraseña → cookies de sesión.
4. **Cambio de contraseña**: pide la actual; revoca todas las demás sesiones.
5. **Olvidé mi contraseña**: autoservicio con **código por correo** (ver 3.3.1). El admin conserva `reset-password` como alternativa, con verificación de identidad por canal externo; queda en AuditLog.

### 3.3.1 Recuperación de contraseña con código por correo

```
1. POST /auth/password/forgot {email}
     → SIEMPRE responde igual: "Si el correo existe, enviamos un código" (no revela si existe)
     → si existe y está activo: genera código, guarda su hash, envía correo
2. POST /auth/password/verify {email, code}   → devuelve un resetToken de un solo uso (5 min)
3. POST /auth/password/reset  {resetToken, newPassword}
     → aplica política de contraseña, revoca TODAS las sesiones, notifica por correo
```

| Medida | Valor propuesto |
|---|---|
| Código | **8 dígitos** aleatorios criptográficos (`crypto.randomInt`), no derivados de nada |
| Almacenamiento | Solo el **hash** (HMAC-SHA256 con secreto del servidor); nunca en claro |
| Caducidad | **10 minutos**; un solo uso |
| Intentos | Máx. **5** por código; al agotarse, el código muere |
| Pedidos de código | Máx. 3 por correo cada hora y 5 por IP cada hora; reenvío mínimo cada 60 s |
| Un código activo | Pedir uno nuevo invalida el anterior |
| Respuesta uniforme | Mismo mensaje y mismo tiempo exista o no el correo (anti-enumeración) |
| Usuarios solo-Google | No reciben código: se les indica entrar con Google |
| Tras el reinicio | Sesiones revocadas, `passwordChangedAt` actualizado, correo "tu contraseña fue cambiada" |
| Auditoría | `PASSWORD_RESET_REQUESTED`, `..._VERIFIED`, `..._DONE`, `..._FAILED` con IP y dispositivo |

**Envío de correo (P17 decidido): API de Google (Gmail API)** desde una cuenta remitente dedicada (p. ej. `no-reply@tudominio`). Con Google Workspace se usa una cuenta de servicio con delegación a nivel de dominio; con Gmail gratuito, OAuth de esa cuenta (límite de unos 500 correos/día, suficiente para 30 usuarios). El envío va por la cola BullMQ con reintentos, para que un fallo de Google no bloquee el login. El adaptador implementa un puerto `MailSender`, así que cambiar de proveedor luego no toca el dominio. El correo del usuario pasa a ser un dato crítico: cambiarlo exige contraseña actual y notifica al correo anterior.
Riesgo asumido: quien controle el buzón del usuario puede tomar su cuenta; por eso los límites estrictos y, si lo decides, 2FA para admins (P8).

## 4. Sesiones: JWT en cookies + refresh

### 4.1 Tokens

| Token | Contenido | Duración | Dónde |
|---|---|---|---|
| **Access JWT** | `sub` (userId), `sid` (sessionId), `iat`, `exp` | **15 min** | Cookie `__Host-access` |
| **Refresh token** | cadena aleatoria de 256 bits (opaca, no JWT) | **7 días** máx., con inactividad ❓ P5 | Cookie `refresh` |

El JWT **no incluye roles ni permisos**: se consultan en cada petición (cacheados en Redis ~60 s). Así, quitar un permiso o bloquear a alguien surte efecto de inmediato, no al caducar el token.

### 4.2 Atributos de las cookies
- `HttpOnly` (JavaScript no puede leerlas → un XSS no roba la sesión).
- `Secure` (solo HTTPS; en desarrollo local se relaja).
- `SameSite=Strict`.
- Refresh con `Path=/api/v1/auth` (solo viaja a los endpoints de auth).
- **Protección CSRF**: SameSite=Strict + cabecera obligatoria `X-Requested-With` en peticiones que modifican datos + verificación de `Origin`.

### 4.3 Rotación y detección de robo
```
login          → crea Session (familia F), emite access#1 + refresh#1
refresh#1 usado → marca refresh#1 como USADO, emite access#2 + refresh#2 (misma familia F)
refresh#1 usado OTRA VEZ → alguien lo copió → se REVOCA toda la familia F
                           (el usuario real y el atacante quedan fuera) + evento de auditoría
```

### 4.4 Cierre de sesión por tiempo
- **Inactividad**: si no hay actividad durante N minutos, el refresh deja de ser válido ❓ P5 (propuesta: 30 min).
- **Duración absoluta**: aunque haya actividad, la sesión muere a las X horas ❓ P5 (propuesta: 12 h = una jornada).
- El frontend muestra aviso "Tu sesión expira en 1 minuto" y cierra sola.
- **Logout** revoca la sesión en el servidor (no solo borra la cookie). Existe "cerrar todas mis sesiones" y el admin puede revocar sesiones de un usuario.
- **Máximo 3 sesiones activas por usuario (P7 decidido): el 4º login se RECHAZA** con un mensaje claro ("Ya tienes 3 sesiones abiertas"). Solo cuentan sesiones vigentes (no revocadas ni expiradas por inactividad/duración), así que una sesión olvidada libera su cupo sola a los 30 min. El usuario puede cerrar sesiones desde un dispositivo ya conectado, y el admin puede revocarlas.
- **Usuario deshabilitado o con contraseña cambiada** → todas sus sesiones se revocan al instante.

### 4.5 WebSocket
La conexión Socket.IO lee la **misma cookie** en el handshake y valida la sesión. Si la sesión se revoca, el servidor desconecta el socket. Cada unión a una sala (`conversation:id`) revalida pertenencia.

### 4.6 App móvil (Capacitor)
Las cookies en el WebView de una app nativa pueden comportarse distinto (otro origen). Dos opciones; ❓ P6:
- (a) Servir la app con el mismo dominio (`server.hostname` de Capacitor) para que las cookies funcionen igual. Más simple.
- (b) En móvil usar tokens en almacenamiento seguro del dispositivo (Keystore), con el mismo mecanismo de refresh. Más trabajo.

## 5. Modelo de datos – Nivel 1 (a implementar)

```prisma
model User {
  id                 String    @id @default(uuid())
  email              String    @unique            // identificador de login; minúsculas, normalizado
  displayName        String
  passwordHash       String?                      // null si el usuario solo entra con Google
  googleIdentity     GoogleIdentity?
  status             UserStatus @default(ACTIVE)  // ACTIVE | DISABLED | LOCKED
  mustChangePassword Boolean   @default(true)
  failedAttempts     Int       @default(0)
  lockedUntil        DateTime?
  passwordChangedAt  DateTime  @default(now())
  lastLoginAt        DateTime?
  createdAt          DateTime  @default(now())
  createdById        String?
  sessions           Session[]
  passwordHistory    PasswordHistory[]
}

model GoogleIdentity {     // vínculo cuenta Google ↔ usuario del sistema
  id        String   @id @default(uuid())
  userId    String   @unique
  googleSub String   @unique        // ID estable de Google (NO el email, que puede cambiar)
  linkedAt  DateTime @default(now())
  user      User     @relation(fields: [userId], references: [id])
}

model PasswordHistory {
  id           String   @id @default(uuid())
  userId       String
  passwordHash String
  createdAt    DateTime @default(now())
  user         User     @relation(fields: [userId], references: [id])
}

model Session {            // una fila por inicio de sesión (dispositivo)
  id               String    @id @default(uuid())   // = sid del JWT
  userId           String
  familyId         String                            // para detección de reutilización
  refreshHash      String    @unique                 // SHA-256 del refresh vigente
  prevRefreshHash  String?                           // para detectar reutilización
  ip               String?
  userAgent        String?
  createdAt        DateTime  @default(now())
  lastActivityAt   DateTime  @default(now())
  absoluteExpiresAt DateTime
  revokedAt        DateTime?
  revokedReason    String?                           // LOGOUT | ROTATION_REUSE | ADMIN | PASSWORD_CHANGED
  user             User      @relation(fields: [userId], references: [id])
  @@index([userId, revokedAt])
}

model SecurityEvent {      // auditoría append-only
  id        String   @id @default(uuid())
  userId    String?
  type      String   // LOGIN_OK, LOGIN_FAIL, LOCKED, LOGOUT, REFRESH_REUSE, PASSWORD_CHANGED, ...
  ip        String?
  userAgent String?
  metadata  Json?
  createdAt DateTime @default(now())
  @@index([userId, createdAt])
  @@index([type, createdAt])
}
```

Los niveles 2–4 (Role, Permission, Section, Group…) se modelan **después** de que apruebes el nivel 1, pero así encajan:

```
User ─< UserRole >─ Role ─< RolePermission >─ Permission      (rol global)
Section ─< Group                                              (Group.sectionId, obligatorio)
User ─< GroupMember(groupRole) >─ Group                       (rol dentro del grupo)
User ── sectionId (sección principal)                         (❓ P11)
Branch(sucursal) ─< IpRule(cidr)                              (lista blanca, ver 5.1)
```

## 5.1 Auditoría, IP, dispositivo y lista blanca

### Aclaración de "todo evento se audita"
Habrá **dos registros**, ambos de solo inserción (nunca se editan ni borran):

| Registro | Qué guarda | Ejemplos |
|---|---|---|
| **SecurityEvent** | Eventos de autenticación y de control de acceso | login OK/fallido, bloqueo de cuenta, logout, refresh reutilizado, cambio de contraseña, cambio de rol/permisos, acceso denegado, sesión revocada |
| **AuditLog** | Cada acción de negocio relevante | subir/descargar documento, enviar mensaje a un grupo, crear grupo, añadir miembro, aprobar revisión, deshabilitar usuario |

Cada fila incluye siempre: **fecha y hora (UTC, con milisegundos), usuario, acción, recurso afectado (tipo + id), resultado (OK/DENEGADO), IP, identificador de dispositivo, user-agent** y, para cambios de datos, un resumen del valor anterior y nuevo. Los **datos sensibles nunca se registran** (contraseñas, tokens, contenido de mensajes).

```prisma
model AuditLog {
  id         String   @id @default(uuid())
  at         DateTime @default(now())          // UTC
  userId     String?
  action     String                            // "document.download", "group.member.add"
  resource   String?                           // "document", "group"
  resourceId String?
  result     String                            // OK | DENIED | ERROR
  ip         String?
  deviceId   String?
  userAgent  String?
  sessionId  String?
  before     Json?
  after      Json?
  @@index([userId, at])
  @@index([resource, resourceId, at])
  @@index([action, at])
}
```

### ¿IP y dirección MAC?
- **IP: sí.** Se registra en cada evento.
  - Detrás de Nginx hay que configurar `trust proxy` para que Nginx sea el único que puede decir cuál es la IP real (si no, un atacante falsifica `X-Forwarded-For` y engaña a la auditoría).
- **MAC: no es posible** desde una web ni desde un servidor remoto. La dirección MAC solo es visible dentro de la misma red local; en cuanto la petición pasa por un router, desaparece. El navegador tampoco permite leerla.
- **Alternativa real: ID de dispositivo.** Al primer ingreso se genera un identificador aleatorio guardado en el dispositivo (en la app móvil con el plugin de Capacitor `Device`/UUID de instalación). Permite reconocer "este es el mismo PC/celular de siempre", detectar equipos nuevos y avisar al usuario. No es infalible (se puede borrar), pero junto con IP y user-agent da buena trazabilidad.
- Si necesitas identificar equipos físicos de la oficina (MAC real), eso se resuelve en la **red local** (DHCP/firewall/NAC), no en esta aplicación.

### Lista blanca de IP (sucursales)
Modelo propuesto:

```prisma
model Branch {            // sucursal
  id     String   @id @default(uuid())
  name   String
  active Boolean  @default(true)
  rules  IpRule[]
}
model IpRule {
  id       String  @id @default(uuid())
  branchId String
  cidr     String           // "200.10.5.20/32" o "200.10.5.0/24"
  note     String?
  active   Boolean @default(true)
  branch   Branch  @relation(fields: [branchId], references: [id])
}
```

⚠️ **Importante – NAT**: todos los usuarios de una sucursal salen a Internet con **la misma IP pública**. Si los límites anti-fuerza-bruta fueran solo por IP, **5 usuarios que se equivoquen en una sucursal bloquearían a todos**. Por eso la lista blanca tiene que influir en los límites.

Qué puede hacer la lista blanca → **decidido, ver sección 5.2** (límites configurables por usuario/IP/rol + lista negra). Opciones consideradas:
- **(A) Límites más altos / exentos por IP** para IPs de sucursales (el bloqueo de cuenta por usuario sigue funcionando igual). *Recomendado, indispensable.*
- **(B) Restringir el login** de ciertos roles/usuarios/secciones a IPs de lista blanca (ej. el admin solo desde la oficina central). *Recomendado para admins.*
- **(C) Sesiones más largas o sin aviso** para IPs de confianza. *No lo recomiendo.*
- **(D) Marcar como "inusual"** (y auditar/avisar) un acceso desde IP fuera de lista. *Recomendado como complemento.*

Gestión: solo con permiso `network.manage`; todo cambio en la lista blanca queda en AuditLog.

## 5.2 Límites de peticiones, lista blanca y lista negra

### Perfiles de límite (configurables)
Un **perfil** define cuántas peticiones por minuto se permiten, por tipo:

```prisma
model RateLimitProfile {
  id               String  @id @default(uuid())
  name             String  @unique       // "estandar", "sucursal", "admin", "integracion", "restringido"
  generalPerMin    Int     @default(120) // lectura normal de la API
  writePerMin      Int     @default(40)  // crear/modificar
  uploadPerMin     Int     @default(10)  // subida de archivos
  downloadPerMin   Int     @default(30)
  authPerMin       Int     @default(10)  // login / recuperación (solo para IP, no cuenta)
  wsEventsPerSec   Int     @default(10)  // eventos de socket (mensajes)
}
```

Se puede asignar un perfil a: **un usuario**, **un rol**, **una IP/rango** (lista blanca) o ser el **por defecto**.
Precedencia (gana el más específico): `usuario > IP/rango > rol > por defecto`.
Los cambios se aplican en segundos (caché Redis con invalidación) y se auditan.

### Quién se cuenta
- **Sin sesión** (login, recuperación): se cuenta por **IP**, con perfil estricto.
- **Con sesión**: se cuenta **por usuario**, no por IP. Así 15 personas de una sucursal con la misma IP pública no se bloquean entre sí.
- El bloqueo de **cuenta** por intentos fallidos sigue siendo independiente de la IP.

### Lista blanca y lista negra

```prisma
model IpRule {
  id          String      @id @default(uuid())
  type        IpRuleType            // ALLOW | DENY
  cidr        String                // "200.10.5.20/32" o "200.10.5.0/24" (IPv4/IPv6)
  branchId    String?               // sucursal asociada (opcional)
  profileId   String?               // perfil de límites que aplica (solo ALLOW)
  source      String   @default("MANUAL")   // MANUAL | AUTO
  reason      String?
  expiresAt   DateTime?             // null = permanente; las AUTO siempre caducan
  active      Boolean  @default(true)
  createdById String?
  createdAt   DateTime @default(now())
  @@index([type, active])
}
```

| Lista | Efecto |
|---|---|
| **Blanca (ALLOW)** | Aplica el perfil de límites de la sucursal (más holgado); evita que el anti-abuso la bloquee automáticamente; permite login a roles restringidos por IP (admins). **No** salta autenticación, permisos ni bloqueo de cuenta. |
| **Negra (DENY)** | La IP recibe rechazo inmediato (403/silencio) **antes** de cualquier otra lógica. |
| **Automática** | Si una IP supera X violaciones de límite o X logins fallidos en Y minutos → DENY temporal (15 min, luego 1 h, 24 h progresivo) + evento de seguridad. Nunca se aplica a IP en lista blanca (solo se alerta). |

Evaluación al llegar una petición (orden):
```
1. ¿IP en DENY vigente?                → rechazar (consulta Redis, ~microsegundos)
2. ¿IP en ALLOW?                       → toma su perfil
3. ¿hay sesión? → usuario > IP > rol > defecto para escoger perfil
4. Contar en Redis (ventana deslizante) → si excede: 429 + cabecera Retry-After + registro
5. Continuar con autenticación / permisos
```

Protecciones para no encerrarte a ti mismo: no se puede añadir a DENY la IP desde la que opera el admin ni un rango ya en ALLOW; siempre debe existir un acceso de emergencia (acceso al servidor/consola para limpiar reglas).

### Recomendaciones adicionales contra ataques (en capas)
| Capa | Medida |
|---|---|
| Red | **Nginx** con `limit_req` y `limit_conn` como primer filtro (rápido, antes de Node); **fail2ban** que lee los logs y banea en el firewall. |
| Borde | Un proxy/WAF delante (p. ej. **Cloudflare** plan gratis) frena ataques volumétricos que ningún código del servidor puede absorber. Con él, la IP real viene de `CF-Connecting-IP` (configurar `trust proxy` correctamente). |
| Aplicación | Los límites de arriba + validación estricta de entradas + tamaño máximo de cuerpo. |
| Login | Retardo creciente tras fallos, bloqueo de cuenta, alerta al usuario por correo. |
| WebSocket | Límite de conexiones por usuario (≤3, igual que sesiones) y de eventos/segundo. |
| Monitoreo | Panel con IP bloqueadas, picos de 429 y logins fallidos; alerta si hay ráfagas. |
| Opcional | Bloqueo geográfico (permitir solo tu país) si todos los usuarios están en una región. ❓ P18 |

## 5.2.1 Bloqueo geográfico (P18 decidido: sí, configurable)

- Por defecto solo se permite el acceso desde los **países configurados** (❓ P20: ¿cuáles?). Una IP de otro país se rechaza antes de autenticar (junto con la lista negra) y se audita.
- **Configurable** desde el panel (`network.manage`): lista de países permitidos, activar/desactivar global.
- **Excepciones**: por usuario (`allowedCountries` o `geoExempt`, para quien viaja o vive en otro país) y por IP de lista blanca (una sucursal en otro país).
- Origen del país de la IP: base **GeoLite2 de MaxMind** (local, gratis con cuenta, se actualiza periódicamente) o la cabecera `CF-IPCountry` si se usa Cloudflare.
- Limitación: una VPN permite aparentar otro país; es una capa más, no una garantía. Por eso se combina con dispositivos aprobados y límites.

## 5.3 Dispositivos nuevos: aprobación del administrador

Cada equipo (PC, celular) se registra como **Dispositivo** la primera vez que un usuario inicia sesión.

```prisma
model Device {
  id           String       @id @default(uuid())
  userId       String
  keyHash      String       @unique   // SHA-256 del identificador aleatorio guardado en el equipo
  label        String?                // "Chrome en Windows", "Android - Pixel"
  status       DeviceStatus @default(PENDING)   // PENDING | TRUSTED | BLOCKED
  firstIp      String?
  lastIp       String?
  userAgent    String?
  firstSeenAt  DateTime     @default(now())
  lastSeenAt   DateTime     @default(now())
  decidedById  String?
  decidedAt    DateTime?
  reason       String?
  @@index([userId, status])
  @@index([status, firstSeenAt])
}
```

**Identificador del dispositivo:** 256 bits aleatorios, guardados en una cookie `HttpOnly` de 1 año (web) o en el almacenamiento seguro del teléfono (app). Si el usuario borra cookies, el equipo aparece como **nuevo** (falla hacia el lado seguro).

**Flujo al iniciar sesión (credenciales correctas):**
```
¿Dispositivo conocido y TRUSTED?  → sesión normal
¿Dispositivo BLOCKED?             → login rechazado ("dispositivo no autorizado") + evento DEVICE_BLOCKED_ATTEMPT
¿Dispositivo nuevo?               → se crea como PENDING y, según la política:
     • Modo AVISO:      el login entra; se notifica al usuario (correo + notificación en app)
                        Y al administrador (bandeja "Dispositivos nuevos").
                        El admin puede Aprobar o Bloquear → Bloquear cierra sus sesiones al instante.
     • Modo APROBACIÓN: la sesión NO se concede hasta que el admin apruebe ("pendiente de autorización").
```
Al usuario se le muestra/envía: dispositivo, IP aproximada, fecha y hora, con botón "No fui yo" (bloquea el dispositivo y cierra la sesión de inmediato, y avisa al admin).

**Política decidida (P19): APROBACIÓN previa para TODOS.** Un dispositivo nuevo queda `PENDING`: el usuario ve "Dispositivo pendiente de autorización" y **no obtiene sesión** hasta que un admin lo apruebe. El admin recibe aviso en tiempo real (notificación + bandeja). El modo AVISO se mantiene en el diseño solo como opción configurable futura.

Casos a cubrir para no quedar encerrados:
- **Primer administrador (bootstrap):** su primer dispositivo se aprueba con un comando de consola del servidor (`npm run device:approve -- <email>`), no desde la web.
- **Dispositivo nuevo de un admin:** lo aprueba otro admin; si solo existe un admin, se usa el mismo comando de consola (acceso de emergencia).
- **Pendientes caducan:** un dispositivo PENDING sin resolver se elimina a los 7 días; cada usuario puede tener máx. 5 solicitudes pendientes (evita inundar la bandeja).
- Las IP en lista blanca **no** aprueban dispositivos automáticamente (la aprobación es siempre explícita).

Todo cambio de estado de un dispositivo se registra en AuditLog (quién decidió, cuándo, motivo).

## 5.4 Retención y archivo de la auditoría — ⏸ DIFERIDO (no se programa hasta llegar a esta fase)

> Se deja documentado como propuesta. Las tablas de auditoría se crean **particionadas por mes desde el inicio** (cuesta poco y deja la puerta abierta), pero el proceso de exportación/archivo y el plazo definitivo se deciden después.

**Sí, se debe archivar.** Recomendación y por qué:

| Etapa | Qué | Por qué |
|---|---|---|
| **En línea (caliente)** | Últimos **12 meses** en PostgreSQL, tablas **particionadas por mes** | Las consultas del panel siguen rápidas porque los índices son pequeños; es lo que se consulta el 95 % de las veces. |
| **Archivo (frío)** | Cada mes que cumple 12 meses se exporta a archivo comprimido (CSV/Parquet `.gz`) en el almacenamiento de objetos (MinIO/S3), con su **hash SHA-256** y bloqueo de escritura (object lock) | Cuesta una fracción, no se puede alterar sin que se note, y se puede restaurar para una investigación. |
| **Eliminación** | Solo cuando venza el plazo legal/interno (propuesta: **5 años** en total) y de forma auditada | Cumplir normativa y no acumular datos personales indefinidamente. |

Ventajas de particionar por mes: archivar es *desacoplar una partición* (instantáneo, sin `DELETE` masivo que bloquea la base ni deja la tabla hinchada).

Casos especiales:
- **Trazabilidad de documentos** (`document_access_logs`): se conserva mientras el documento exista **más** el plazo de retención.
- **Eventos de seguridad graves** (bloqueos, reutilización de refresh): mismo plazo; nunca se purgan antes.
- Los archivos exportados se consultan bajo demanda (restaurar la partición a una tabla temporal), con permiso `audit.read_archive`.
- ❓ P14: confirma el plazo total. Si tienes una **obligación legal** de tu país o sector, manda ese plazo y lo ajustamos.

## 6. API del nivel 1

| Método | Ruta | Descripción |
|---|---|---|
| POST | `/auth/login` | `{email, password}` → cookies. Rate-limit estricto. |
| GET | `/auth/google` | Inicia el flujo OAuth con Google. |
| GET | `/auth/google/callback` | Valida el código (PKCE), vincula/identifica usuario → cookies. |
| POST | `/auth/refresh` | Rota el refresh y emite nuevo access. |
| POST | `/auth/logout` | Revoca la sesión actual. |
| POST | `/auth/logout-all` | Revoca todas mis sesiones. |
| POST | `/auth/change-password` | `{current, new}`. |
| POST | `/auth/password/forgot` | `{email}` → envía código (respuesta uniforme). |
| POST | `/auth/password/verify` | `{email, code}` → `resetToken` de un uso. |
| POST | `/auth/password/reset` | `{resetToken, newPassword}`. |
| GET/POST/PATCH/DELETE | `/admin/ip-rules` | (permiso `network.manage`) lista blanca/negra. |
| GET/POST/PATCH | `/admin/rate-profiles` | (permiso `network.manage`) perfiles de límite; asignar a usuario/rol/IP. |
| GET | `/admin/devices?status=PENDING` | (permiso `device.manage`) bandeja de dispositivos nuevos. |
| POST | `/admin/devices/:id/approve` · `/block` | Aprobar / bloquear (el bloqueo cierra sesiones). |
| GET | `/me/devices` · POST `/me/devices/:id/report` | El usuario ve sus equipos y puede marcar "no fui yo". |
| GET | `/auth/me` | Usuario actual (y luego roles/permisos). |
| GET | `/auth/sessions` | Mis sesiones activas (dispositivo, IP, última actividad). |
| DELETE | `/auth/sessions/:id` | Cerrar una sesión concreta. |
| POST | `/users` | (admin) Crear usuario + contraseña temporal. |
| POST | `/users/:id/reset-password` | (admin) Nueva temporal; revoca sesiones. |
| PATCH | `/users/:id/status` | (admin) Habilitar / deshabilitar. |

Estructura de módulos (arquitectura limpia, igual que `files` y `chat`):

```
modules/auth/
  domain/        Password (política), SessionPolicy, puertos: UserRepository, SessionRepository,
                 PasswordHasher, TokenService, SecurityEventLog
  application/   LoginUseCase, RefreshSessionUseCase, LogoutUseCase, ChangePasswordUseCase, ...
  infrastructure/ Argon2PasswordHasher, JwtTokenService, PrismaUserRepository, PrismaSessionRepository
  presentation/  AuthController, JwtCookieGuard, @CurrentUser
  auth.public-api.ts
```

`JwtCookieGuard` sustituye al `DevAuthGuard` actual; los controladores de `files` no cambian.

## 7. Cabeceras y transporte
HTTPS obligatorio (HSTS), Helmet, CORS restringido a los orígenes del frontend, límite global de peticiones, tamaño máximo de cuerpo, validación estricta de entradas (`whitelist`, `forbidNonWhitelisted`), IDs UUID (no secuenciales).

## 8. Pruebas de seguridad que escribiremos
- Usuario A no puede leer/descargar/ver existencia del documento de B (→ 404).
- Usuario fuera de un grupo no recibe mensajes ni puede unirse a su sala.
- Refresh reutilizado revoca la familia.
- 5 fallos bloquean; mensajes idénticos para usuario inexistente y contraseña errónea.
- Sesión expirada por inactividad / duración absoluta.
- Usuario deshabilitado pierde acceso en la siguiente petición y su socket se cierra.

## 9. ❓ Preguntas para ti (con mi recomendación)

| # | Pregunta | Recomendación |
|---|---|---|
| ~~P1~~ | ✅ Sección = área/departamento | – |
| ~~P2~~ | ✅ Cada grupo pertenece a una sección. Falta: ¿un usuario puede estar en varias secciones? (ver P11) | – |
| ~~P3~~ | ✅ Login por **correo** + autenticación con **Google** | – |
| ~~P16~~ | ✅ Google = acceso rápido, con interruptor (global / rol / usuario). La contraseña sigue existiendo. | – |
| ~~P4~~ | ✅ Recuperación de contraseña con **código por correo** (diseño en 3.3.1). El admin conserva el reinicio manual como alternativa. | – |
| ~~P17~~ | ✅ Correo por **API de Google (Gmail API)**. Pendiente saber si es Google Workspace o Gmail gratuito. | – |
| ~~P18~~ | ✅ Bloqueo geográfico configurable, con desbloqueo por usuario/IP para otros países (5.2.1). | – |
| **P20** | ¿Qué país(es) se permiten por defecto? | Solo el país donde opera la organización |
| **P21** | ¿La cuenta de correo es **Google Workspace** (dominio propio) o Gmail gratuito? | – |
| ~~P5~~ | ✅ Inactividad 30 min, duración absoluta 12 h | – |
| ~~P6~~ | ✅ App móvil con cookies en el mismo dominio (opción a). | – |
| ~~P7~~ | ✅ Máximo **3 sesiones simultáneas**; la 4ª se **rechaza**. | – |
| ~~P8~~ | ✅ OTP solo para recuperar contraseña. **No** se exige 2FA con app autenticadora a los admins. | – |
| ~~P9~~ | ✅ Rol **auditor** aparte con `audit.read`. | – |
| **P10** | ¿Los admins pueden leer mensajes privados de otros? | **No** (solo moderación de contenido reportado) |
| **P11** | ¿El usuario tiene una **sección principal** propia (además de las que hereda por sus grupos)? ¿Puede pertenecer a **varias** secciones? | Sección principal directa + puede heredar otras por grupos |
| ~~P12~~ | ✅ Lista blanca y negra con **límites de peticiones/min configurables** por usuario, IP/sucursal y rol (5.2). ⏸ Restringir login de admins por IP y marcar acceso inusual: **diferido** ("luego"). | – |
| ~~P13~~ | ✅ Sin MAC; se usa IP + ID de dispositivo + user-agent. Los dispositivos nuevos aparecen al administrador, que puede aprobarlos o bloquearlos (5.3). | – |
| ~~P19~~ | ✅ **Aprobación previa para todos**: un dispositivo nuevo no entra hasta que el admin lo autorice (5.3). | – |
| ~~P14~~ | ⏸ **Diferido**: archivo/retención de auditoría se decide y programa más adelante (5.4). | – |
| ~~P15~~ | ✅ Se avisa al usuario y se registra el evento de dispositivo nuevo. | – |
