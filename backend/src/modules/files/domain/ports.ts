import { Readable } from 'stream';
import {
  AccessLogEntry, Document, DocumentStatus, DocumentVersion, EstadoInicial, Review, ReviewDecision, SharePermission,
} from './document';

export const DOCUMENT_REPOSITORY = Symbol('DOCUMENT_REPOSITORY');
export const ACCESS_LOG_REPOSITORY = Symbol('ACCESS_LOG_REPOSITORY');
export const FILE_STORAGE = Symbol('FILE_STORAGE');
export const USER_DIRECTORY = Symbol('USER_DIRECTORY');
export const OFFICE_EDITOR_PORT = Symbol('OFFICE_EDITOR_PORT');

export type NewVersion = Omit<DocumentVersion, 'id' | 'versionNumber' | 'createdAt' | 'documentId'>;

export interface NewDocument {
  codigo: string;
  nombreDocumento: string;
  descripcion?: string;
  estado: EstadoInicial;
  fechaCreacion: Date;
  gestion: number;
  usuarioId: string;
  revisorId?: string;
  version: NewVersion;
}

export interface VisibleDocument { document: Document; permission: SharePermission | 'PROPIETARIO' }

export type ReviewRecord = Review & { comment?: string; requestedAt: Date; decidedAt?: Date };

export interface DocumentRepository {
  /** Crea documento + versión 1 en una sola transacción. Lanza ConflictError si el código ya existe. */
  createWithFirstVersion(input: NewDocument): Promise<{ document: Document; version: DocumentVersion }>;

  /** Calcula el siguiente número de versión dentro de la transacción (evita carreras). */
  addVersion(documentId: string, version: NewVersion): Promise<DocumentVersion>;

  findById(id: string): Promise<Document | null>;
  findByCodigo(codigo: string): Promise<Document | null>;
  findVersion(documentId: string, versionId: string): Promise<DocumentVersion | null>;
  listVersions(documentId: string): Promise<DocumentVersion[]>;
  listReviews(documentId: string): Promise<ReviewRecord[]>;
  /** Documentos que el usuario creó o que le compartieron (vigentes). */
  listVisible(userId: string): Promise<VisibleDocument[]>;

  getSharePermission(documentId: string, userId: string): Promise<SharePermission | null>;
  upsertShare(input: {
    documentId: string; userId: string; permission: SharePermission; sharedById: string;
  }): Promise<void>;

  /** Cambia el estado y deja constancia de quién y cuándo lo modificó (y opcionalmente el revisor). */
  setStatus(documentId: string, estado: DocumentStatus, usuarioId: string, revisorId?: string): Promise<void>;
  createReview(input: {
    documentId: string; versionId: string; reviewerId: string; requestedBy: string;
  }): Promise<Review>;
  findReview(reviewId: string): Promise<Review | null>;
  decideReview(reviewId: string, decision: ReviewDecision, comment?: string): Promise<void>;
}

/** Bitácora append-only: solo existe `append` y lectura. No hay update ni delete. */
export interface AccessLogRepository {
  append(entry: AccessLogEntry): Promise<void>;
  listByDocument(documentId: string, opts: { take: number; cursor?: string }): Promise<
    Array<AccessLogEntry & { id: string; createdAt: Date }>
  >;
}

export interface FileStorage {
  put(key: string, body: Buffer, mimeType: string): Promise<void>;
  /** Flujo de lectura. La descarga pasa SIEMPRE por el backend: así cada descarga queda registrada. */
  read(key: string): Promise<Readable>;
}

/** Nombres de usuarios (para mostrar quién creó/modificó/revisó). Lo implementa un adaptador. */
export interface UserDirectory {
  namesOf(ids: string[]): Promise<Map<string, string>>;
  listActiveUsers?(excludeUserId?: string): Promise<Array<{ id: string; name: string; email: string }>>;
}

export interface OfficeTokenClaims {
  purpose: 'file-fetch' | 'callback';
  documentId: string;
  versionId: string;
  userId: string;
}

/**
 * Puerto hacia el servidor de edición en tiempo real (OnlyOffice Document Server).
 * Aísla los tokens JWT de OnlyOffice, las URLs del contenedor y la descarga del documento editado.
 */
export interface OfficeEditorPort {
  /** URL pública del contenedor OnlyOffice (para que el navegador cargue web-apps/apps/api/documents/api.js). */
  readonly serverPublicUrl: string;
  /** URL interna con la que el contenedor OnlyOffice alcanza a este backend para leer/guardar el archivo. */
  readonly backendInternalUrl: string;
  /** Firma la configuración JSON de DocsAPI.DocEditor con el secreto de OnlyOffice. */
  signEditorConfig(configPayload: Record<string, unknown>): string;
  /** Firma un token temporal de un propósito específico ('file-fetch' o 'callback'). */
  signActionToken(claims: OfficeTokenClaims, ttlSeconds: number): string;
  /** Verifica y decodifica un token temporal emitido por signActionToken. */
  verifyActionToken(token: string): OfficeTokenClaims | null;
  /** Verifica el JWT que envía el servidor OnlyOffice al disparar el callback de guardado. */
  verifyCallbackJwt(token: string): Record<string, unknown> | null;
  /** Descarga el archivo ya editado desde el contenedor OnlyOffice (con validación anti-SSRF). */
  fetchEditedFile(downloadUrl: string): Promise<Buffer>;
}
