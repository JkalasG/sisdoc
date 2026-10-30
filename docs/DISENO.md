# SisDoc – Reglas de diseño (fuente de verdad)

> Este documento fija **cómo se ve** SisDoc. Si una regla de aquí choca con "lo que quedó bien en una pantalla",
> gana este documento. Cambiar una regla = editar este archivo **y** los tokens, en un solo commit.
> Lo esencial está protegido por una prueba automática (`src/shared/design-rules.spec.ts`).

## 1. Principio

**Una sola aplicación, un solo lenguaje visual.** La red social, la mensajería, los documentos y el panel
administrativo comparten la misma barra, las mismas tarjetas, los mismos botones y la misma paleta.
El panel admin solo añade un menú lateral y tablas; **no** tiene colores ni formas propias.

## 2. Colores: solo tokens globales

Los colores viven en **un único lugar**: las variables CSS de `frontend/src/index.css`
(`:root` = claro, `[data-theme='dark']` = oscuro). `tailwind.config.js` solo las expone con nombre.
Cambiar un valor ahí cambia toda la app, en ambos modos.

| Token (clase Tailwind) | Para qué | Claro | Oscuro |
|---|---|---|---|
| `bg-paper` | Fondo de la página; fondo de campos "píldora"; hover suave | `#F0F2F5` | `#18191A` |
| `bg-surface` | Tarjetas, barras, menús, modales, tablas | `#FFFFFF` | `#242526` |
| `border-line` / `divide-line` | Bordes y separadores | `#E4E6EB` | `#3E4042` |
| `text-ink` | Texto principal | `#1C1E21` | `#E4E6EB` |
| `text-ink-soft` | Texto secundario (subtítulos, cabeceras de tabla) | `#5B5F66` | `#B0B3B8` |
| `text-ink-mute` | Texto terciario, placeholders, iconos inactivos | `#8A8D91` | `#82868C` |
| `brand` · `brand-dark` · `brand-light` · `brand-ring` | Acción principal · hover · fondo de acento/seleccionado · anillo de foco | `#2F6FED` … | `#3B75EB` … |
| `ok` · `ok-soft` · `ok-ink` | Éxito / aprobado / activo | verde | verde claro |
| `amber` · `amber-soft` · `amber-ink` | Advertencia / pendiente / "Demo" | ámbar | ámbar |
| `danger` · `danger-soft` | Error / bloquear / destructivo | rojo | rojo claro |
| `chat-*` | Solo mensajería (burbuja enviada, fondo, acento, ticks) | WhatsApp | WhatsApp oscuro |

El `/<alpha>` funciona con todos: `bg-brand/10`, `bg-ink/5`, `text-ink/60`…

### Prohibido en componentes (la prueba lo detecta)

- Paleta de grises de Tailwind: `slate-*`, `gray-*`, `zinc-*`, `neutral-*`, `stone-*` → usa `ink`, `paper`, `line`.
- `green-*`, `emerald-*`, `red-*` → usa `ok` y `danger`.
- `bg-white` → usa `bg-surface` (en oscuro no sería blanco). Excepción documentada: el pulgar de `Switch` y el lienzo del PDF en `FilePreview`.
- Colores hexadecimales dentro de `className`.
- `shadow-sm|md|lg|xl` → usa `shadow-card` (reposo) o `shadow-pop` (flotantes).

### Permitido (no cambian entre temas)

- `text-white` sobre `bg-brand`, `bg-danger`, `bg-amber`, `bg-ok` y sobre fotos/degradados.
- Degradados decorativos de avatares e historias (`from-… to-…`) y acentos de iconos de color (rosa, celeste).
- Capas negras translúcidas sobre imágenes (`bg-black/45`, `bg-black/50` para el fondo de modales).
- Si necesitas un matiz nuevo de verdad (p. ej. "info"), **se agrega como token** en `index.css` + `tailwind.config.js` + esta tabla, nunca suelto en un componente.

## 3. Modo claro / oscuro

- El tema vive en `<html data-theme="light|dark">`. Preferencia: **Claro · Oscuro · Auto** (sigue al sistema), guardada en `localStorage['sisdoc-theme']`.
- `index.html` aplica el tema **antes de pintar** (sin destello). `src/shared/theme.ts` lo gestiona; `ThemeSwitch` es el selector (menú de la cuenta y pie del menú lateral admin).
- Todo componente nuevo debe verse bien en **ambos** modos sin escribir `dark:` (los tokens ya cambian). `dark:` solo se admite para casos puntuales de matiz (p. ej. colores de nombre en chats grupales).
- Contraste mínimo: 4.5:1 en texto normal. `text-white` sobre `brand` se mantiene porque los valores oscuros de `brand` están elegidos para cumplirlo.

## 4. Estructura de pantalla

| Zona | Regla |
|---|---|
| Barra superior | `h-14`, `bg-surface`, `shadow-card`, logo circular `bg-brand` + "SisDoc" en `text-brand` extrabold. Sin borde inferior. |
| Menú lateral (admin) | Mismo `bg-surface` + `shadow-card`. Ítem activo = `bg-brand-light text-brand`. Hover = `bg-paper`. Insignias de conteo en `bg-amber`. Selector de tema en el pie. |
| Fondo de página | Siempre `bg-paper`. El contenido va en tarjetas `bg-surface`. |
| Ancho de contenido | Feed/documentos ≤ 960 px centrado; admin ≤ 1400 px. Móvil: gutter de 16 px, sin scroll horizontal. |
| Navegación móvil | Barra inferior fija de 5 pestañas; el menú lateral admin pasa a cajón. |

## 5. Componentes (usar siempre estos, no inventar variantes)

| Componente | Clase / archivo | Notas |
|---|---|---|
| Tarjeta | `.card` (`rounded-xl bg-surface shadow-card`) | **Sin borde.** Panel y StatCard del admin son `.card`. |
| Botón primario | `.btn-primary` | Una sola acción primaria por zona. |
| Botón secundario | `.btn-ghost` | `bg-paper`, hover `bg-line`. |
| Destructivo | `.btn-danger` | Solo para acciones que no se pueden deshacer. |
| Botón de icono | `.icon-btn` | Círculo 40 px `bg-paper`. Siempre con `aria-label`. |
| Campo de texto | `.field` + `.label` (etiqueta en minúsculas normales, sin MAYÚSCULAS) | `bg-surface`, borde `line`, foco `brand`. |
| Insignia de estado | `Pill` (admin) / `StatusBadge` (documentos) | Tonos: `ok`, `warn`, `bad`, `info`, `mute`. Punto + texto (no solo color). |
| Tabla | `DataTable` | Cabecera `bg-paper` en mayúsculas pequeñas, filas con hover `paper/70`, contador al pie. |
| Fecha y hora | `DateTimeField` (`shared/ui`) | **Nunca** `<input type="date">` nativo (se ve distinto en cada navegador y no respeta el tema). Calendario propio en portal, hora editable, no admite fechas posteriores a `max`, Escape lo cierra sin cerrar el modal. Valor ISO 8601. |
| Interruptor sí/no | `Switch` (`shared/ui`) | Para opciones de dos estados con nombre (Borrador / Revisado). Nunca una casilla. `role="switch"` + `aria-checked`. |
| Vista previa de archivo | `FilePreview` (`shared/ui`) | Local, sin subir nada: imagen, PDF y texto; el resto muestra su ficha. Libera la URL al desmontar. |
| Avatar | `Avatar` | Degradado según el nombre; `online` = punto `ok` con borde `surface`. |
| Modal | `Modal` (`shared/ui/Modal.tsx`) | **Único** modal de la app. Cabecera fija · cuerpo con scroll · `footer` fijo para las acciones (nunca se pierden en pantallas bajas). Tamaños `sm · md · lg · xl`. Portal al `body`, bloquea el scroll de la página, atrapa y devuelve el foco, Escape cierra solo el de encima, clic en el fondo solo cierra si empezó y terminó allí. `dismissible={false}` para avisos que exigen decisión. En móvil sube desde abajo. Los botones de acción van en `footer`, enlazados al formulario con `form={id}`. |
| Aviso efímero | `Toaster` / `proto()` | Fondo `ink`, texto `surface` (se invierte solo en oscuro). |

Botones de acción en tablas: **solo icono** con `title` y `aria-label` descriptivos.

## 6. Tipografía, forma y espacio

- Fuente: Segoe UI / sistema (`font-sans`). Títulos `font-bold tracking-tight`: H1 `text-2xl`, secciones `text-base font-semibold`.
- Texto base 15 px; secundario 14 px; micro 11–12 px (cabeceras de tabla y etiquetas).
- Radios: tarjetas y paneles `rounded-xl`, botones/campos `rounded-lg`, chips y buscadores `rounded-full`.
- Espacios en múltiplos de 4 px; entre tarjetas `gap-5` (20 px); relleno interno `p-4`.
- Iconos: `lucide-react`, 16–20 px en menús y tablas, 24 px en la barra principal.
- Animación: solo `animate-rise` (entradas) y `animate-toast`; nada más de 300 ms.

## 7. Accesibilidad (no negociable)

- Todo control con icono lleva `aria-label`. Tablas con `aria-label`. Modales con `role="dialog"`.
- Foco visible siempre (anillo `brand-ring`, ya global en `index.css`).
- El estado nunca se comunica **solo** con color: lleva texto o icono.
- Objetivos táctiles ≥ 36 px (botones de tabla) y ≥ 40 px (resto).

## 8. Cómo cambiar el diseño sin romperlo

1. ¿Es un cambio de **color**? Edita los valores en `index.css` (ambos temas) y la tabla de la sección 2.
2. ¿Es un componente **nuevo**? Constrúyelo solo con tokens y las clases de la sección 5. Revísalo en claro y oscuro.
3. ¿Necesitas un color/variante que no existe? Agrégalo **como token** primero.
4. Ejecuta `npm test`: `design-rules.spec.ts` falla si se coló un color suelto.
5. Si la regla cambió, actualiza este documento en el mismo commit.
