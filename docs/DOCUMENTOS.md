# Documentos – registro maestro y carga

Todo lo de la base de datos de documentos está **en español y sin tildes ni eñes** (tablas, columnas, tipos y valores de estado).
Los `@map` de `backend/prisma/schema.prisma` hacen la traducción; el código TypeScript de los campos del registro también usa estos nombres.

## 1. Qué llena la persona y qué llena el sistema

| Campo (columna) | Lo llena | Regla |
|---|---|---|
| `codigo` | **Persona** | Obligatorio, único, 2–40 caracteres: letras, números y `. _ / -`. Se guarda en MAYÚSCULAS (`pr-com-001` → `PR-COM-001`). Sin tildes ni eñes. Repetido → **409**. |
| `nombre_documento` | **Persona** (sugerido) | Por defecto el nombre del archivo sin extensión (`procedimiento_de_compras.docx` → «procedimiento de compras»). Se puede cambiar; si lo deja vacío vuelve al del archivo. Máx. 200. |
| `fecha_creacion` | **Persona** | **Fecha y hora** de creación del documento. Por defecto ahora; puede ser pasada, **no futura** (5 min de tolerancia por relojes). |
| `estado` | **Persona** (interruptor) | Interruptor «Documento revisado»: apagado = `borrador`, encendido = `revisado`. |
| `usuario_creador_id` | Sistema | Quien lo carga. |
| `fecha_modificacion` · `usuario_modificador_id` | Sistema | Cambia con cada cambio de **datos o de estado** (nueva versión, pedir/decidir revisión). Al crear = creación. |
| `version` | Sistema | Número de la versión vigente (1, 2, 3…). |
| `fecha_actualizacion` · `usuario_actualizador_id` | Sistema | Cambia solo cuando se sube un **archivo nuevo** (nueva versión). Al crear = creación. |
| `revisor_id` | Sistema | Cargado como *revisado* → quien lo cargó. Al pedir revisión → el revisor asignado. Al decidir → quien decidió. Borrador sin revisión → vacío. |
| `url_word` · `url_pdf` | Sistema | Un `.docx/.doc` actualiza `url_word`; un `.pdf` actualiza `url_pdf`; otros tipos no tocan ninguna. Guardan la ruta de descarga `/documents/:id/download?versionId=…`, que **pasa por el backend** (cada descarga queda registrada). |
| `gestion` | Sistema | Año de `fecha_creacion` **en la zona horaria de la organización** (`APP_TIMEZONE`, por defecto `America/La_Paz`), no en UTC: un documento creado el 31/dic 22:00 sigue siendo de esa gestión. |
| `cambios` | Sistema | `no` al crear; `si` en cuanto existe una segunda versión. |

### Fechas y horas
**Todas** las columnas de fecha del sistema son `TIMESTAMPTZ(3)` (fecha + hora + zona, con milisegundos), no solo las de documentos.
Se guardan en UTC y el navegador las muestra en hora local (`dd/mm/aaaa hh:mm`). Migración `20261031130000_fechas_con_zona_horaria`.

## 2. Estados (en la base de datos)

| Valor | Significado |
|---|---|
| `borrador` | Estado inicial (casilla sin marcar). También vuelve a este si un revisor pide cambios. |
| `revisado` | Estado inicial (casilla marcada). |
| `en_revision` | Se pidió revisión a alguien. |
| `aprobado` · `rechazado` | Decisión del revisor. |
| `archivado` | Reservado. |

Otros tipos: `decision_revision` (`pendiente`, `aprobado`, `rechazado`, `cambios_solicitados`), `permiso_comparticion` (`ver`, `descargar`, `editar`),
`accion_documento` (`subir`, `nueva_version`, `ver`, `descargar`, `compartir`, `dejar_de_compartir`, `revision_solicitada`, `revision_decidida`, `estado_cambiado`, `eliminar`, `restaurar`),
`si_no` (`si`, `no`). El canal de la bitácora es `archivos` o `chat:<id>`.

## 3. Tablas

| Tabla | Antes |
|---|---|
| `documentos` | `documents` (registro maestro, con los campos de arriba) |
| `documento_versiones` | `document_versions` (`numero_version`, `nombre_archivo`, `tipo_mime`, `tamano_bytes`, `suma_sha256`, `nota_cambio`, `subido_por_id`, `creado_en`) |
| `documento_comparticiones` | `document_shares` |
| `documento_revisiones` | `document_reviews` |
| `documento_bitacora_accesos` | `document_access_logs` (solo se inserta, jamás se actualiza ni borra) |

Migración: `backend/prisma/migrations/20261031120000_documentos_en_espanol`. Se aplicó sobre tablas vacías (solo había datos de desarrollo).

## 4. API

| Endpoint | Para qué |
|---|---|
| `GET /documents` | Registro maestro de los documentos que creé o me compartieron (con `miPermiso`, nombres de personas y versión vigente). |
| `GET /documents/:id` | Detalle: lo anterior + `versions` y `reviews`. Lo ajeno responde **404**. |
| `POST /documents` (multipart) | Campos: `file`, `codigo`, `nombreDocumento?`, `fechaCreacion?` (AAAA-MM-DD), `estado?` (`BORRADOR`\|`REVISADO`). |
| `POST /documents/:id/versions` | Nueva versión (`file`, `changeNote?`). |
| `GET /documents/:id/download?versionId=` | Descarga; registra quién, versión, IP y agente. |
| `GET /documents/:id/history` · `POST /documents/:id/reviews` · `PATCH /reviews/:id` | Trazabilidad y revisiones. |

Valores en la API (los mismos del esquema, en mayúsculas): estados `BORRADOR REVISADO EN_REVISION APROBADO RECHAZADO ARCHIVADO`,
permisos `PROPIETARIO EDITAR DESCARGAR VER`, decisiones `PENDIENTE APROBADO RECHAZADO CAMBIOS_SOLICITADOS`, cambios `SI NO`.

## 5. Pantallas (frontend)

- **Documentos** (`/documentos`): tabla del registro maestro con las 14 columnas (código, nombre, fecha creación, fecha modificación, usuario creador, usuario modificador, versión, fecha actualización, usuario actualizador, revisor, Word, PDF, gestión, cambios) más el estado. Búsqueda, filtro por gestión y por «Míos / Compartidos / En revisión». Word y PDF descargan por el backend.
- **Cargar documento**: archivo con **vista previa a un costado** (formulario a la izquierda, vista previa a la derecha; en móvil queda debajo). Se ven imagen, PDF, texto, **Word (.docx), Excel (.xlsx) y PowerPoint (.pptx)** (ver «Vista previa de archivos»). Campos: nombre (sugerido), **fecha y hora** de creación (selector propio) e interruptor Borrador / Revisado. Avisa qué completa el sistema.

Componentes reutilizables (en `frontend/src/shared/ui/`, sin dependencias externas): `DateTimeField`, `Switch`, `FilePreview`.
- **Detalle** (`/documentos/:id`): ficha «Registro del documento» con todos los campos + versiones, revisiones e historial.

## 6. Pruebas que lo respaldan

- Unitarias de dominio: `backend/src/modules/files/domain/document.spec.ts` (código, nombre, fecha/gestión, Word/PDF, acceso, estados).
- e2e contra PostgreSQL: `backend/test/documentos-registro.e2e-spec.ts` (carga con campos automáticos, validaciones, 409 por código repetido, auditoría al versionar y revisar, listado/detalle, **nombres de columnas y valores en español en la base de datos**) y `files-isolation.e2e-spec.ts` (aislamiento: lo ajeno no existe).
- Frontend: `mock-backend.spec.ts` (el mock aplica las mismas reglas) y `App.spec.tsx` (tabla, formulario de carga, error 409).

## 7. Decisiones que conviene confirmar

1. **Revisor al cargar como «revisado»**: queda quien lo cargó. Si prefieres que el revisor sea siempre otra persona, se cambia a «vacío hasta que alguien revise».
2. **`gestion`** = año de la fecha de creación en la zona de la organización. Si tu gestión es otro periodo (p. ej. fiscal), se ajusta en `gestionDe()`.
3. **Modificación vs. actualización**: *modificación* = cualquier cambio de datos/estado; *actualización* = solo cuando cambia el archivo.
4. **`cambios`** pasa a `si` cuando hay una segunda versión (no cuando solo cambia el estado).

## 8. Vista previa de archivos (antes de cargar)

Todo ocurre **en el navegador, sobre el archivo elegido; no se sube nada** hasta pulsar «Cargar». Los visores de Office se cargan solo cuando hace falta
(quien sube un PDF no descarga nada extra).

| Tipo | Cómo se ve | Mecanismo |
|---|---|---|
| Imagen · PDF · texto | Tal cual | Visor del navegador (`<img>`, `<iframe>`) y lectura local |
| Word `.docx` | Hojas con el aspecto del papel (estilos, tablas, listas, imágenes), reducidas para caber en el panel | `docx-preview` |
| Excel `.xlsx` / `.xlsm` | Tabla tipo hoja de cálculo: columnas A, B…, filas numeradas, números a la derecha, fechas legibles, pestañas por hoja. Primeras 300 filas × 40 columnas | `read-excel-file` |
| PowerPoint `.pptx` | Diapositivas con su diseño y la **proporción real** del archivo (4:3 o 16:9) | `pptx-preview` + `jszip` |
| `.doc` · `.xls` · `.ppt` antiguos | Ficha que explica que hay que guardarlos como `.docx/.xlsx/.pptx` (son binarios propietarios: no se pueden dibujar sin un servidor) | — |
| Archivo de Office > 25 MB, protegido o dañado | Ficha con el motivo; el archivo se carga igual | — |

Notas:
- Las fórmulas de Excel muestran el valor guardado por Excel al grabar el archivo; si el archivo lo generó un programa que no calcula (p. ej. una librería), la celda sale vacía.
- El visor de PowerPoint (`pptx-preview`) es gratuito para uso comercial pero **de código cerrado**; solo se usa para dibujar el archivo que la propia persona eligió.
- Para documentos **ya guardados** (descargar y ver desde el registro) la mejor fidelidad se logra con un servidor: convertir a PDF con LibreOffice o abrir en modo lectura con OnlyOffice
  (el backend ya reserva un puerto `OFFICE_EDITOR_PORT`). Es el siguiente paso si quieres la misma vista en el detalle del documento.
