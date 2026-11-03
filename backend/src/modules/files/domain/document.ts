// Dominio puro: sin Nest, sin Prisma, sin almacenamiento concreto.
import { ForbiddenError, NotFoundError, ValidationError } from '../../../shared/domain/domain-error';

export type DocumentStatus = 'BORRADOR' | 'REVISADO' | 'EN_REVISION' | 'APROBADO' | 'RECHAZADO' | 'ARCHIVADO';
/** Estados que el usuario puede elegir al cargar el documento (el resto lo mueve el flujo de revisión). */
export type EstadoInicial = Extract<DocumentStatus, 'BORRADOR' | 'REVISADO'>;
export type SiNo = 'SI' | 'NO';
export type SharePermission = 'VER' | 'DESCARGAR' | 'EDITAR';
export type ReviewDecision = 'PENDIENTE' | 'APROBADO' | 'RECHAZADO' | 'CAMBIOS_SOLICITADOS';
export type DocumentAction =
  | 'SUBIR' | 'NUEVA_VERSION' | 'VER' | 'DESCARGAR' | 'COMPARTIR' | 'DEJAR_DE_COMPARTIR'
  | 'REVISION_SOLICITADA' | 'REVISION_DECIDIDA' | 'ESTADO_CAMBIADO' | 'ELIMINAR' | 'RESTAURAR';

export interface DocumentVersion {
  id: string;
  documentId: string;
  versionNumber: number;
  versionMenor: number;
  storageKey: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  checksumSha256: string;
  changeNote?: string;
  uploadedById: string;
  createdAt: Date;
}

/** Etiqueta legible de versión: 1.0 (subida), 1.1, 1.2 (ediciones en línea), 2.0 (nuevo archivo). */
export const etiquetaVersion = (mayor: number, menor: number): string => `${mayor}.${menor}`;

/** MAYOR = se subió un archivo nuevo; MENOR = edición en línea sobre la versión vigente. */
export type TipoCambioVersion = 'MAYOR' | 'MENOR';

/** Registro maestro del documento. Los campos de auditoría los llena el sistema, no el formulario. */
export interface Document {
  id: string;
  codigo: string;
  nombreDocumento: string;
  descripcion?: string;
  estado: DocumentStatus;
  gestion: number;
  cambios: SiNo;
  version: number;
  versionMenor: number;
  fechaCreacion: Date;
  usuarioCreadorId: string;
  fechaModificacion: Date;
  usuarioModificadorId: string;
  fechaActualizacion: Date;
  usuarioActualizadorId: string;
  revisorId?: string;
  urlWord?: string;
  urlPdf?: string;
  versionVigenteId?: string;
  eliminado: boolean;
}

export interface Review {
  id: string;
  documentId: string;
  versionId: string;
  reviewerId: string;
  requestedBy: string;
  decision: ReviewDecision;
}

export interface AccessLogEntry {
  documentId: string;
  versionId?: string;
  userId: string;
  action: DocumentAction;
  ip?: string;
  userAgent?: string;
  channel?: string; // "archivos" | "chat:<conversationId>"
  metadata?: Record<string, unknown>;
}

const RANK: Record<SharePermission, number> = { VER: 1, DESCARGAR: 2, EDITAR: 3 };

/** Regla de negocio de acceso. El creador puede todo; el resto depende del permiso compartido. */
export function hasPermission(
  doc: Pick<Document, 'usuarioCreadorId' | 'eliminado'>,
  userId: string,
  share: SharePermission | null,
  needed: SharePermission,
): boolean {
  if (doc.eliminado) return false;
  if (doc.usuarioCreadorId === userId) return true;
  return share !== null && RANK[share] >= RANK[needed];
}

/**
 * Regla "lo ajeno no existe": quien no puede ni VER el documento recibe 404 (no revela que existe);
 * quien puede verlo pero no hacer `needed` recibe 403.
 */
export function assertAccess(
  doc: Document | null,
  userId: string,
  share: SharePermission | null,
  needed: SharePermission,
): asserts doc is Document {
  if (!doc || !hasPermission(doc, userId, share, 'VER')) throw new NotFoundError('Documento');
  if (!hasPermission(doc, userId, share, needed)) throw new ForbiddenError();
}

/** Estado resultante del documento según la decisión del revisor. */
export function statusAfterDecision(decision: ReviewDecision): DocumentStatus {
  switch (decision) {
    case 'APROBADO': return 'APROBADO';
    case 'RECHAZADO': return 'RECHAZADO';
    case 'CAMBIOS_SOLICITADOS': return 'BORRADOR';
    default: return 'EN_REVISION';
  }
}

// ---------------------------------------------------------------- registro maestro

/** Código de documento: letras, números y . _ / - (p. ej. "PR-GEN-001"). Se guarda en mayúsculas. */
export function normalizarCodigo(raw: string): string {
  const codigo = (raw ?? '').trim().toUpperCase();
  if (codigo.length < 2 || codigo.length > 40) throw new ValidationError('El código debe tener entre 2 y 40 caracteres');
  if (!/^[A-Z0-9][A-Z0-9._\/-]*$/.test(codigo)) {
    throw new ValidationError('El código solo admite letras, números y los signos . _ / -');
  }
  return codigo;
}

/** El nombre sugerido es el del archivo sin su extensión. El usuario puede cambiarlo. */
export function nombreDesdeArchivo(fileName: string): string {
  const base = fileName.replace(/\.[^./\\]+$/, '').replace(/[_]+/g, ' ').trim();
  return base || fileName;
}

export function normalizarNombre(raw: string | undefined, fileName: string): string {
  const nombre = (raw ?? '').trim() || nombreDesdeArchivo(fileName);
  if (nombre.length > 200) throw new ValidationError('El nombre del documento no puede superar 200 caracteres');
  return nombre;
}

/** Zona horaria de la organización: define en qué año cae una fecha (la gestión). */
export const ZONA_HORARIA_POR_DEFECTO = 'America/La_Paz';

/** La gestión es el año de la fecha de creación, **en la zona horaria de la organización** (no en UTC). */
export function gestionDe(fecha: Date, zonaHoraria = ZONA_HORARIA_POR_DEFECTO): number {
  return Number(new Intl.DateTimeFormat('en-US', { timeZone: zonaHoraria, year: 'numeric' }).format(fecha));
}

/** Fecha y hora de creación: si no viene, ahora; no puede estar en el futuro (5 min de tolerancia por relojes). */
export function normalizarFechaCreacion(raw: Date | undefined, ahora: Date): Date {
  if (!raw) return ahora;
  if (Number.isNaN(raw.getTime())) throw new ValidationError('La fecha de creación no es válida');
  if (raw.getTime() > ahora.getTime() + 5 * 60_000) throw new ValidationError('La fecha de creación no puede ser futura');
  return raw;
}

/**
 * multer/busboy leen el nombre del archivo como latin1 aunque el navegador lo envía en UTF-8:
 * "Presentación básica.pptx" llega como "PresentaciÃ³n bÃ¡sica.pptx". Se revierte esa lectura.
 * Si el nombre ya es correcto (tiene letras fuera de latin1 o no es UTF-8 válido al reinterpretarlo), se deja igual.
 */
export function repararNombreArchivo(nombre: string): string {
  if (/[^\u0000-ÿ]/.test(nombre)) return nombre.normalize('NFC');
  const reinterpretado = Buffer.from(nombre, 'latin1').toString('utf8');
  return (reinterpretado.includes('�') ? nombre : reinterpretado).normalize('NFC');
}

const MIME_POR_EXTENSION: Record<string, string> = {
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  pdf: 'application/pdf', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', txt: 'text/plain',
};
/**
 * Algunos navegadores/equipos mandan Office (p. ej. .pptx) sin tipo o como application/octet-stream.
 * En ese caso se deduce el tipo por la extensión; si el navegador sí informa un tipo, se respeta.
 */
export function resolverMime(nombreArchivo: string, mimeInformado: string | undefined): string {
  const m = (mimeInformado ?? '').toLowerCase().trim();
  if (m && m !== 'application/octet-stream' && m !== 'application/zip' && m !== 'application/x-zip-compressed') return m;
  const ext = nombreArchivo.split('.').pop()?.toLowerCase() ?? '';
  return MIME_POR_EXTENSION[ext] ?? m;
}

export type TipoUrl = 'word' | 'pdf';
const WORD_MIME = new Set([
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/msword',
]);
/** Qué columna de URL actualiza un archivo: los Word van a url_word y los PDF a url_pdf; el resto, a ninguna. */
export function tipoUrl(mimeType: string): TipoUrl | null {
  if (WORD_MIME.has(mimeType)) return 'word';
  if (mimeType === 'application/pdf') return 'pdf';
  return null;
}

/** URL de descarga (pasa SIEMPRE por el backend para que cada descarga quede registrada). */
export const urlDescarga = (documentId: string, versionId: string) =>
  `/documents/${documentId}/download?versionId=${versionId}`;

// ---------------------------------------------------------------- edición en tiempo real (OnlyOffice)

export interface InfoEditorOfimatico {
  documentType: 'word' | 'cell' | 'slide';
  fileType: 'docx' | 'doc' | 'xlsx' | 'pptx' | 'pdf' | 'txt';
  editable: boolean;
}

const MAPA_EDITOR_OFIMATICO: Record<string, InfoEditorOfimatico> = {
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': {
    documentType: 'word', fileType: 'docx', editable: true,
  },
  'application/msword': {
    documentType: 'word', fileType: 'doc', editable: false,
  },
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': {
    documentType: 'cell', fileType: 'xlsx', editable: true,
  },
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': {
    documentType: 'slide', fileType: 'pptx', editable: true,
  },
  'application/pdf': {
    documentType: 'word', fileType: 'pdf', editable: false,
  },
  'text/plain': {
    documentType: 'word', fileType: 'txt', editable: true,
  },
};

/** Determina cómo debe abrirse el archivo en OnlyOffice y si su formato admite edición en vivo. */
export function tipoEditorOfimatico(mimeType: string): InfoEditorOfimatico | null {
  return MAPA_EDITOR_OFIMATICO[mimeType] ?? null;
}

/**
 * Clave única de sesión colaborativa en OnlyOffice.
 * Incluye documento + versión vigente: todos los usuarios que abren la misma versión
 * entran a la misma sala de edición en tiempo real; al guardarse una nueva versión, la clave rota.
 */
export function claveEdicionColaborativa(documentId: string, versionId: string): string {
  return `${documentId}_${versionId}`.replace(/[^0-9a-zA-Z._-]/g, '_').slice(0, 128);
}

/**
 * Estados del callback de OnlyOffice:
 * 1 = editando en vivo, 2 = listo para guardar (cerraron el editor), 4 = cerrado sin cambios, 6 = guardado forzoso en vivo.
 * Solo en 2 y 6 OnlyOffice entrega un archivo modificado que debe generar una nueva versión.
 */
export function debeGuardarCallbackOfimatico(status: number): boolean {
  return status === 2 || status === 6;
}
