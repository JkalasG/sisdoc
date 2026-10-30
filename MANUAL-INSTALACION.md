# Manual de instalación – SisDoc (Windows 10/11)

Proyecto: red social interna + mensajería + gestión documental.
Stack: React/Vite/Capacitor · NestJS · Prisma · PostgreSQL · Redis · MinIO (S3).

---

## 1. Qué instalar

### Obligatorio desde el día 1

| # | Herramienta | Versión | Para qué | Descarga |
|---|---|---|---|---|
| 1 | **Node.js** | 22 LTS o 24 (tu 24.19 sirve) | Backend y frontend | nodejs.org |
| 2 | **Git** | cualquiera reciente | Control de versiones | git-scm.com |
| 3 | **Docker Desktop** | 4.x | Levanta PostgreSQL, Redis y MinIO sin instalarlos en Windows | docker.com |
| 4 | **VS Code** | última | Editor | code.visualstudio.com |

> PostgreSQL, Redis y MinIO **no se instalan en Windows**: corren en contenedores con `docker compose`.

### Extensiones de VS Code recomendadas
`Prisma` · `ESLint` · `Prettier` · `Tailwind CSS IntelliSense` · `Docker` · `DotENV`

### Herramientas globales (npm)
```powershell
npm install -g @nestjs/cli
```
(Prisma, Vite y Capacitor se usan con `npx`, no hace falta global.)

### Opcional / según fase

| Herramienta | Fase | Para qué |
|---|---|---|
| **Bruno** o **Postman** | 1 | Probar la API (subidas multipart) |
| **Cuenta Firebase** (gratis) | 4 | Notificaciones push (FCM) |
| **Android Studio** (incluye JDK) | 5 | Generar el APK con Capacitor |
| **DBeaver** | opcional | Ver la base de datos (también sirve `npx prisma studio`) |
| **Cuenta Google Play** (25 USD) | 5 | Publicar la app |

---

## 2. Verificar lo instalado

```powershell
node -v        # v22.x o v24.x
npm -v
git --version
docker --version
docker compose version
nest --version
```

---

## 3. Estructura del proyecto

```
sisdoc/
├── docker-compose.yml          → postgres, redis, minio
├── MANUAL-INSTALACION.md
├── docs/ARQUITECTURA.md
├── backend/                    → NestJS (monolito modular + arquitectura limpia)
│   ├── prisma/                 → schema.prisma, migrations/, seed.ts
│   └── src/
│       ├── main.ts · app.module.ts
│       ├── shared/             → errores, Prisma, guards compartidos
│       └── modules/
│           ├── files/          → gestión documental
│           │   ├── domain/ · application/ · infrastructure/ · presentation/
│           │   └── files.public-api.ts   ← único contacto con otros módulos
│           └── chat/           → mensajería
│               └── domain/ · application/ · infrastructure/ · presentation/
└── frontend/                   → React + Vite (+ Capacitor luego)
    └── src/
        ├── app/ · shared/
        └── features/ files/ chat/ ...
```

---

## 4. Puesta en marcha (paso a paso)

### 4.1 Infraestructura (PostgreSQL + Redis + MinIO)
Abre Docker Desktop y espera a que diga "running". Luego:

```powershell
cd C:\sistemas\sisdoc
docker compose up -d
docker compose ps
```

| Servicio | Dirección | Credenciales (solo desarrollo) |
|---|---|---|
| PostgreSQL | localhost:**5434** | sisdoc / sisdoc_dev, BD `sisdoc` (y `sisdoc_test` para pruebas) |
| Redis | localhost:**6381** | – (aún no se usa; se activa con sesiones en caché y sockets) |

Los puertos 5434/6381 evitan chocar con otros PostgreSQL/Redis que tengas en esta máquina.
**No hay MinIO**: los documentos se guardan en disco (`backend/storage`, variable `STORAGE_DIR`). Haz copia de esa carpeta junto con la base de datos.

Si Redis no es necesario todavía, basta `docker compose up -d postgres`.

### 4.2 Backend
```powershell
cd C:\sistemas\sisdoc\backend
copy .env.example .env          # edita los secretos JWT
npm install
npx prisma migrate dev               # aplica las migraciones existentes
npx prisma db seed                   # crea admin@sisdoc.local (cambia SEED_ADMIN_PASSWORD si quieres otra)
npm run start:dev
```

**Primer ingreso del administrador** (todo dispositivo nuevo debe ser aprobado):
1. Inicia sesión una vez desde el navegador → responde "Dispositivo pendiente de autorización".
2. En la consola del servidor: `npm run device:approve -- admin@sisdoc.local`
3. Vuelve a iniciar sesión; el sistema te obliga a cambiar la contraseña.

**Pruebas:**
```powershell
npm test            # unitarias + pruebas de arquitectura (sin base de datos)
npm run test:e2e    # integración contra PostgreSQL real (BD sisdoc_test; requiere docker compose up -d postgres)
```
- API: http://localhost:3000/api/v1
- Swagger: http://localhost:3000/docs

### 4.3 Frontend
```powershell
cd C:\sistemas\sisdoc\frontend
copy .env.example .env
npm install
npm run dev
```
Web: http://localhost:5173

> Tailwind y shadcn/ui se inicializan en la Fase 2 (`npx tailwindcss init -p`, `npx shadcn@latest init`).

---

## 5. Probar el módulo de archivos (sin login todavía)

> ⚠️ Esta sección quedó **obsoleta**: el guard temporal `x-user-id` ya no existe. Los endpoints exigen sesión por cookie (`POST /api/v1/auth/login`) y la cabecera `X-Requested-With: XMLHttpRequest` en toda petición que modifica datos. Los ejemplos reales están en `backend/test/*.e2e-spec.ts`; los ejemplos de abajo se actualizarán con el panel.

```powershell
# Subir documento (versión 1)
curl -X POST http://localhost:3000/api/v1/documents `
  -H "x-user-id: <UUID_USUARIO>" `
  -F "title=Contrato 2026" -F "file=@C:\ruta\contrato.pdf"

# Subir revisión (versión 2)
curl -X POST http://localhost:3000/api/v1/documents/<DOC_ID>/versions `
  -H "x-user-id: <UUID_USUARIO>" -F "changeNote=Corrección cláusula 4" -F "file=@C:\ruta\contrato-v2.pdf"

# Descargar (devuelve URL temporal y registra la descarga)
curl http://localhost:3000/api/v1/documents/<DOC_ID>/download -H "x-user-id: <UUID_USUARIO>"

# Historial / trazabilidad
curl http://localhost:3000/api/v1/documents/<DOC_ID>/history -H "x-user-id: <UUID_USUARIO>"
```

---

## 6. Comandos del día a día

| Acción | Comando (en `backend/`) |
|---|---|
| Nueva migración tras cambiar `schema.prisma` | `npx prisma migrate dev --name <nombre>` |
| Regenerar cliente Prisma | `npx prisma generate` |
| Ver la BD | `npx prisma studio` |
| Crear módulo nuevo | `nest g module modules/<nombre>` y crear sus 4 capas |
| Apagar infraestructura | `docker compose down` (conserva datos) |
| Borrar TODO, incluidos datos | `docker compose down -v` |

---

## 7. Android (Fase 5, más adelante)

1. Instalar Android Studio y aceptar los SDK.
2. Configurar `ANDROID_HOME` y agregar `platform-tools` al PATH.
3. En `frontend/`:
```powershell
npm install @capacitor/core @capacitor/cli @capacitor/android
npx cap init SisDoc com.tuempresa.sisdoc --web-dir dist
npm run build
npx cap add android
npx cap sync
npx cap open android
```

---

## 8. Problemas frecuentes

| Síntoma | Causa / solución |
|---|---|
| `docker compose` no conecta | Docker Desktop no está iniciado. Ábrelo y espera. |
| Puerto 5432 ocupado | Otro PostgreSQL local. Detenlo o cambia el puerto en `docker-compose.yml` y en `DATABASE_URL`. |
| `P1001 Can't reach database` | Contenedor apagado: `docker compose up -d`. |
| `argon2` falla al instalar | Instala "Desktop development with C++" (Build Tools de Visual Studio) y reintenta `npm install`. |
| Error CORS en el navegador | `CORS_ORIGIN` en `backend/.env` debe coincidir con la URL del frontend. |
| `port is already allocated` al hacer `docker compose up` | Otro contenedor usa ese puerto. SisDoc usa 5434 y 6381; cámbialos en `docker-compose.yml` y `.env` si también chocan. |
| `Prisma Migrate detected that it was invoked by Claude Code` | Protección de Prisma ante comandos destructivos (`db push --force-reset`, `migrate reset`). Ejecútalos tú en tu terminal. |
| Login responde 202 "Dispositivo pendiente" | Es lo esperado en un equipo nuevo: un admin debe aprobarlo (`npm run device:approve -- correo`). |
