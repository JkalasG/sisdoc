# Criterios de aprobación – Módulo `auth` (nivel 1)

Estado al cierre de esta entrega: **143 pruebas en verde** (95 unitarias + 48 de integración).

```powershell
cd backend
npm test            # 95: dominio, casos de uso con adaptadores en memoria, arquitectura
npm run test:e2e    # 48: HTTP real + PostgreSQL real (cookies, CSRF, aislamiento de archivos)
```

Cada criterio apunta a la prueba que lo demuestra. Si cambia una regla, cambia su prueba.

| # | Criterio de aceptación | Prueba |
|---|---|---|
| **Contraseñas** | | |
| 1 | Mínimo 12 y máximo 128 caracteres; rechaza comunes, repetidas y las que contienen el correo | `domain-policies.spec` – Política de contraseñas |
| 2 | Hash Argon2id; nunca en claro en BD ni en la bitácora | `auth.e2e` – "solo existen hashes", "jamás guarda contraseñas" |
| 3 | No reutilizar las últimas 5 | `change-password.use-case.spec` |
| **Inicio de sesión** | | |
| 4 | Entra con correo + contraseña desde dispositivo aprobado | `login.use-case.spec`, `auth.e2e` |
| 5 | Usuario inexistente y contraseña errónea: misma respuesta y mismo trabajo de hash | `login.use-case.spec`, `auth.e2e` "indistinguibles" |
| 6 | 5 fallos bloquean 15 min; progresivo 30 y 60; ni la clave correcta entra bloqueado; éxito reinicia el contador | `login.use-case.spec` – bloqueo; `domain-policies.spec` |
| 7 | Usuario deshabilitado no entra | `login.use-case.spec`, `auth.e2e` |
| **Dispositivos** | | |
| 8 | Dispositivo nuevo queda PENDIENTE y **no obtiene sesión** hasta que el admin lo apruebe | `login.use-case.spec`, `auth.e2e` flujo completo |
| 9 | Dispositivo BLOQUEADO es rechazado; bloquearlo expulsa al instante a quien ya estaba dentro | `auth.e2e` |
| 10 | La clave del dispositivo de un usuario no sirve para otro; solo se guarda su hash | `login.use-case.spec`, `auth.e2e` |
| 11 | Un intento con contraseña errónea no registra dispositivos | `login.use-case.spec` |
| **Sesiones** | | |
| 12 | Máximo 3 simultáneas; la 4.ª se rechaza; cerrar o caducar libera el cupo | `login.use-case.spec`, `auth.e2e` (409) |
| 13 | 30 min de inactividad cierran la sesión; la actividad la mantiene | `session-lifecycle.spec`, `auth.e2e` |
| 14 | 12 h absolutas aunque haya actividad | `session-lifecycle.spec`, `auth.e2e` |
| 15 | Refresh rota en cada uso; reutilizar uno viejo revoca la sesión entera y deja constancia | `session-lifecycle.spec`, `auth.e2e` |
| 16 | Logout revoca en el servidor: el access capturado deja de servir | `auth.e2e` |
| 17 | "Cerrar todas" no afecta a otros usuarios | `session-lifecycle.spec` |
| 18 | Deshabilitar usuario o bloquear dispositivo corta el acceso en la siguiente petición | `session-lifecycle.spec`, `auth.e2e` |
| 19 | La actividad se escribe en BD como máximo 1 vez por minuto (rendimiento) | `session-lifecycle.spec` |
| **Cookies y transporte** | | |
| 20 | Cookies HttpOnly + SameSite=Strict; refresh solo viaja a `/api/v1/auth`; el token no va en el cuerpo | `auth.e2e` |
| 21 | CSRF: POST sin `X-Requested-With` u Origin ajeno → 403 | `auth.e2e` |
| 22 | Cabeceras de seguridad; no revela el framework; entradas validadas y campos extra rechazados | `auth.e2e` |
| **Cambio de contraseña** | | |
| 23 | Exige la actual (y fallar cuenta para el bloqueo); aplica la política; cierra las demás sesiones | `change-password.use-case.spec`, `auth.e2e` |
| 24 | Con "debe cambiar contraseña" solo se puede usar `me`, `change-password` y `logout` | `auth.e2e` |
| **Auditoría** | | |
| 25 | Registra login ok/fallo, bloqueo, dispositivo nuevo, refresh reutilizado, logout, cambio de clave, con fecha, usuario, IP y user-agent | `login.use-case.spec`, `auth.e2e` |
| 26 | Nunca guarda contraseñas ni tokens | `login.use-case.spec`, `auth.e2e` |
| **Datos ajenos (módulo files, ya protegido por auth)** | | |
| 27 | Todo endpoint de archivos exige sesión | `files-isolation.e2e` |
| 28 | Un documento ajeno responde **404 idéntico** a uno inexistente (no revela que existe) | `files-isolation.e2e` |
| 29 | Con permiso de descarga puede descargar, pero ver historial o editar da 403 | `files-isolation.e2e` |
| 30 | Cada descarga queda registrada (quién, versión, IP, user-agent); el intento ajeno no | `files-isolation.e2e` |
| 31 | Solo el revisor asignado decide una revisión | `files-isolation.e2e` |
| **Arquitectura** | | |
| 32 | El dominio no depende de Nest ni de librerías técnicas; la aplicación no depende de infraestructura | `architecture.spec` |
| 33 | Prisma solo existe en infraestructura | `architecture.spec` |
| 34 | Un módulo solo accede a otro por su `*.public-api.ts` | `architecture.spec` |

## Lo que NO cubre este módulo todavía (queda para los siguientes bloques)

- Login con Google, recuperación de contraseña por código de correo, panel/endpoints de admin para crear usuarios y aprobar dispositivos (hoy: `npm run device:approve` y `seed`).
- Roles, permisos, secciones y grupos (niveles 2–4).
- Perfiles de límite de peticiones, lista blanca/negra de IP, bloqueo geográfico.
- Caché de sesión en Redis y adaptador Redis de Socket.IO (hoy cada petición hace 1 consulta indexada a PostgreSQL).
- Archivo de auditoría (diferido) y particionado mensual de `security_events` (Prisma no declara particiones; irá en una migración SQL).
- Verificación de pertenencia al unirse a salas de chat (marcado con TODO en el gateway).
