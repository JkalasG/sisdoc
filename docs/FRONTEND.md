# Frontend – guía rápida

```powershell
cd frontend
copy .env.example .env     # VITE_USE_MOCKS=true  → sin backend
npm install
npm run dev                # http://localhost:5173
npm test                   # 63 pruebas contra el backend simulado
```

> **Diseño:** colores, modo oscuro y reglas de componentes en [`DISENO.md`](DISENO.md). Una prueba automática impide usar colores sueltos.

## Modo mock (`VITE_USE_MOCKS`)

| Valor | Qué pasa |
|---|---|
| `true` | **No se usa la red.** Un backend simulado responde en memoria (persiste en `localStorage`). Aparece la etiqueta «Modo demostración» y un panel flotante (matraz) para provocar estados: dispositivo nuevo/bloqueado, límite de 3 sesiones, token vencido, 31 min de inactividad, servidor caído. |
| `false` | La app habla con el backend real (`VITE_API_URL`, por defecto `/api/v1` con proxy de Vite a `localhost:3000`). |

- Es una sola capa: `shared/api/http.ts` elige el *transporte* (fetch real o mock). El manejo de errores, la **renovación silenciosa del token** y el aviso de sesión perdida son el mismo código en ambos modos, así los mocks ejercitan lo real.
- Un build de producción **se niega a arrancar** con mocks activados y no incluye el código del mock (el mock se importa dinámicamente).
- Usuarios de demo: `ana@empresa.com` / `Clave-Segura-2026` · `nueva@empresa.com` / `Temporal-Clave-2026` (obliga a cambiar clave).

## Contrato con el backend

| Endpoint | Backend real | Mock |
|---|---|---|
| `POST /auth/login` `/refresh` `/logout` `/logout-all` `/change-password`, `GET /auth/me` | ✅ existe | ✅ |
| `POST /documents`, `POST /documents/:id/versions`, `GET /documents/:id/download`, `GET /documents/:id/history`, `POST /documents/:id/reviews`, `PATCH /reviews/:id` | ✅ existe | ✅ |
| `GET /documents` (registro maestro con mi permiso) | ✅ existe | ✅ |
| `GET /documents/:id` (detalle con versiones y revisiones) | ✅ existe | ✅ |
| `GET /directory/users` (para elegir revisor) | ❌ **pendiente** | ✅ |
| `GET /conversations`, `GET /conversations/:id/messages`, `POST /conversations/:id/messages` | ❌ **pendiente** (hoy solo socket `message:send`) | ✅ |
| Parámetro `channel=chat:<id>` en la descarga | ❌ pendiente (hoy el backend siempre registra `files`) | ✅ |

Con `VITE_USE_MOCKS=false` hoy funcionan login, cambio de contraseña y sesiones; documentos y mensajes mostrarán error hasta implementar los endpoints pendientes.

## Estructura

```
src/
  app/            App (rutas), AppShell (barra superior), DemoPanel (solo mock)
  features/
    auth/         login, cambio de clave, sesión (zustand), IdleGuard (30 min)
    social/       inicio (historias, publicar, reacciones, comentarios), grupos, notificaciones, perfil  ← PROTOTIPO
    chat/         lista de chats, conversación, burbujas, notas de voz, panel de info  ← mensajería estilo WhatsApp
    admin/        panel administrativo con menú lateral (solo rol ADMIN)  ← PROTOTIPO
    files/        documentos: lista, detalle, versiones, revisiones, historial
  shared/         api/http.ts · api/mock/* · config · format · ui/primitives
```

## Qué es real y qué es prototipo

| Área | Estado |
|---|---|
| Login, sesión, cambio de clave, dispositivo pendiente, inactividad | Real (backend existe) |
| Documentos: subir, versiones, descargar, historial, revisiones | Real (campos y estados en español: ver [`DOCUMENTOS.md`](DOCUMENTOS.md)) |
| Mensajes: enviar, adjuntar documentos, tiempo real | Contrato definido; REST pendiente en backend |
| Notas de voz, imágenes, respuestas citadas, «escribiendo…», ticks de leído | Solo interfaz (datos de demo) |
| Inicio: historias, publicar, reaccionar, comentar, guardar | Prototipo: estado local, se pierde al recargar |
| Grupos, notificaciones, perfil | Prototipo con datos locales (`features/social/data.ts`) |
| Panel administrativo (usuarios, dispositivos, sesiones, documentos, red, auditoría, estructura) | Prototipo con datos locales (`features/admin/data.ts`); las acciones modifican el estado en memoria y generan su evento de auditoría |
| Llamadas, búsqueda global, encuestas, cámara, compartir, menús «⋯» | Botones que avisan «está en prototipo» |

## Panel administrativo

Se abre desde el menú de la cuenta (avatar arriba a la derecha) → **Panel administrativo**, visible solo si el usuario tiene el rol `ADMIN`. Usuario de demo: `admin@empresa.com` / `Clave-Segura-2026`. Ruta `/admin`; un usuario sin el rol es devuelto al inicio.

> El backend aún **no devuelve roles** en `/auth/me` ni tiene los endpoints de administración. Hasta construir el módulo de usuarios y roles, el panel solo funciona en modo demo; en el backend real cada acción se validará por permiso (el frontend solo oculta la opción).

## Pendiente de diseño / UX
- No revisado aún en pantalla por un humano: modo oscuro, accesibilidad con lector de pantalla, estados de carga con esqueletos.
- Sin pantalla de «Mis sesiones y dispositivos», administración (aprobar dispositivos, usuarios) ni notificaciones: dependen de endpoints/módulos aún no construidos.
