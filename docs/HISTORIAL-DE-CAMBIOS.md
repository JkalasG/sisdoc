# Historial de cambios por versión (propuesta pendiente)

> **Estado: PENDIENTE.** Este documento describe un diseño. No hay nada implementado ni probado.
> Hoy, cada guardado en el editor en línea crea una versión completa (1.1, 1.2…) con su SHA-256, autor y una nota fija; el detalle de *qué cambió* no se conserva.

## 1. Objetivo

Al terminar de editar un documento en línea, conservar los cambios realizados en esa sesión, asociarlos a la versión resultante y poder consultarlos, compararlos y restaurarlos.

## 2. Factibilidad

Es factible, con un límite: OnlyOffice entrega los cambios en un formato interno que solo él interpreta (no un texto "se cambió X por Y").

Al guardar (callback con `status` 2 o 6), OnlyOffice envía:

| Dato | Qué es | Utilidad |
|---|---|---|
| `users`, `lastsave` | Quiénes editaron y cuándo se guardó por última vez | "Editado por Ana y Juan" |
| `changesurl` | ZIP con los cambios de la sesión, en formato interno | Se guarda tal cual; OnlyOffice lo usa para su historial y para restaurar |
| `history.serverVersion`, `history.changes` | Lista con autor y fecha de cada bloque de cambios | Línea de tiempo de quién cambió y cuándo |

El backend ya declara `history` y `changesurl` en el DTO del callback (`office-callback.controller.ts`), pero no los guarda.

## 3. Opciones

1. **Guardar los cambios por versión**: tabla nueva con el ZIP de `changesurl`, `history` y autores. Bajo riesgo; no altera el flujo actual.
2. **Historial nativo de OnlyOffice**: el editor muestra "Historial de versiones" con autor/fecha y permite restaurar. Requiere `onRequestHistory`, `onRequestHistoryData` y `onRequestRestore` y dos endpoints del backend.
3. **Comparar dos versiones** con "Comparar documento" (`setRevisedFile`): OnlyOffice marca las diferencias entre v1.1 y v1.2.
4. **Resumen legible** ("+2 párrafos, −1 párrafo"): extraer el texto de dos `.docx` y compararlo. Solo Word; no cubre Excel/PowerPoint ni cambios de formato.

**Recomendación:** opciones 1 y 2; la 4 si se quiere un resumen escrito en la ficha.

## 4. Ejemplo de funcionamiento

Ana abre *INFORME TECNICO SCZ.docx* (vigente v1.2), cambia un párrafo y una tabla, y guarda. Después Juan agrega una conclusión y guarda.

### 4.1 Al guardar

```
POST /documents/:id/office-callback
{ status: 2, key: "doc_ver12", url: ".../output.docx",
  users: ["ana-id"], changesurl: ".../diff.zip",
  history: { serverVersion: "8.2", changes: [
    { created: "2026-11-03 15:02", user: { id: "ana-id", name: "Ana Quispe" } } ] } }
```

El backend, además de crear la versión (como hoy):

1. Descarga `url` y crea la **v1.3**.
2. Descarga `changesurl` y guarda el ZIP en el almacenamiento, ligado a la v1.3.
3. Guarda `history`, autores y hora.
4. (Opcional, solo Word) calcula un resumen: "+2 párrafos, −1 párrafo, 1 tabla modificada".

### 4.2 Tabla nueva

```prisma
model DocumentVersionChange {
  id            String   @id @default(uuid())
  versionId     String   @unique   // versión resultante de esta edición
  baseVersionId String             // versión sobre la que se editó (1.2)
  changesKey    String?            // ZIP de changesurl en el almacenamiento
  serverVersion String?            // versión de OnlyOffice (necesaria para restaurar)
  historyJson   Json?              // quién y cuándo, según OnlyOffice
  authors       String[]           // ids de quienes editaron
  summary       Json?              // {added: 2, removed: 1, ...} solo Word
  createdAt     DateTime @default(now())
}
```

### 4.3 Lo que vería el usuario

Pestaña **Versiones** del detalle:

```
v1.3 vigente  INFORME TECNICO SCZ.docx
  Juan Pérez · 03 nov 2026, 15:40 · 1.5 MB
  Cambios: +1 párrafo · "Conclusión agregada"    [Ver] [Cambios] [Descargar]
v1.2
  Ana Quispe · 03 nov 2026, 13:54
  Cambios: +2 párrafos, −1 párrafo, 1 tabla       [Ver] [Cambios] [Descargar]
```

- **Cambios** abre el editor a pantalla completa con la versión elegida y las diferencias marcadas contra la anterior (opción 3).
- Dentro del editor, **Historial de versiones** lista v1.0…v1.3 con autor y fecha. **Restaurar** crea una versión nueva (v1.4) con ese contenido; nunca se borra nada.

### 4.4 Cómo funciona por dentro

**Historial nativo** (el editor pide al frontend, que pide al backend):

```
onRequestHistory     → GET /documents/:id/office-history
  { currentVersion: 4, history: [ { version: 1, key: "doc_v10", created, user }, ... ] }

onRequestHistoryData → GET /documents/:id/office-history/:n
  { version: 3, key: "doc_v12", url: <archivo de esa versión, firmado>,
    previous: { key: "doc_v11", url: ... }, changesUrl: <ZIP firmado> }
```

Las URLs se firman con el mismo esquema JWT de 15 minutos del editor.

**Comparar:** `editor.setRevisedFile({ url: <versión anterior firmada>, fileType: "docx" })`.

**Seguridad:** permiso VER para el historial, EDITAR para restaurar; anti-SSRF al descargar `changesurl`; cada consulta queda en el registro de accesos con IP.

## 5. Piezas a construir

| Parte | Trabajo |
|---|---|
| Migración | Tabla `DocumentVersionChange` |
| Callback | Guardar ZIP e `history`; resumen en Word |
| Backend | Endpoints `office-history` y `office-history/:n` |
| Frontend | Eventos del historial, botón "Cambios", columna de resumen |
| Pruebas | Callback con `changesurl`, historial, permisos |

## 6. Riesgos

- Hay que confirmar que el OnlyOffice del servidor entrega `changesurl` en el callback (primera prueba; se ve en los logs `[OfficeEditor]`).
- El resumen de texto solo sirve para Word.
- Ediciones simultáneas quedan en un solo registro con varios autores (la granularidad es por sesión de guardado, no por pulsación).
- El ZIP aumenta el almacenamiento (pesa mucho menos que el archivo completo); conviene una política de retención.

## 7. Plan sugerido

1. **Fase 1:** guardar `changesurl` e `history` y mostrar el resumen. Sirve para comprobar que los datos llegan.
2. **Fase 2:** historial nativo y restaurar.
3. **Fase 3:** comparación de versiones.
