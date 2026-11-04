// Contrato entre frontend y backend. Los marcados "(pendiente en backend)" existen hoy solo en el mock.

export interface UserLite { id: string; name: string; email: string }
export interface CurrentUser {
  id: string; email: string; displayName: string; mustChangePassword: boolean;
  roles?: string[]; // PENDIENTE en backend (módulo de roles). Hoy solo lo devuelve el mock.
}

export type LoginResponse =
  | { status: 'OK'; user: CurrentUser; sessionExpiresAt: string }
  | { status: 'DEVICE_PENDING'; message: string };

/** Qué opciones de verificación muestra el login. Lo decide el servidor (backend/.env); nunca incluye secretos. */
export interface AuthConfig {
  captcha: { enabled: boolean; siteKey: string | null };
  google: { enabled: boolean; clientId: string | null };
  passwordReset: { enabled: boolean };
}

export type DocStatus = 'BORRADOR' | 'REVISADO' | 'EN_REVISION' | 'APROBADO' | 'RECHAZADO' | 'ARCHIVADO';
/** Lo que la persona elige al cargar un documento nuevo. */
export type EstadoInicial = Extract<DocStatus, 'BORRADOR' | 'REVISADO'>;
export type MyPermission = 'PROPIETARIO' | 'EDITAR' | 'DESCARGAR' | 'VER';

export interface VersionDTO {
  id: string; versionNumber: number; versionMenor?: number; etiqueta?: string; fileName: string; mimeType: string; sizeBytes: number;
  checksumSha256: string; changeNote?: string; uploadedById: string; uploadedByName: string; createdAt: string;
}
export interface Persona { id: string; nombre: string }
/** Registro maestro del documento (campos en español, igual que la base de datos). */
export interface DocumentSummary {
  id: string; codigo: string; nombreDocumento: string; descripcion?: string; estado: DocStatus;
  gestion: number; cambios: 'SI' | 'NO'; version: number; versionMenor?: number; versionEtiqueta?: string;
  fechaCreacion: string; usuarioCreador: Persona;
  fechaModificacion: string; usuarioModificador: Persona;
  fechaActualizacion: string; usuarioActualizador: Persona;
  revisor?: Persona; urlWord?: string; urlPdf?: string;
  miPermiso: MyPermission; versionVigente: VersionDTO;
}
export type ReviewDecision = 'PENDIENTE' | 'APROBADO' | 'RECHAZADO' | 'CAMBIOS_SOLICITADOS';
export interface ReviewDTO {
  id: string; versionId: string; versionNumber: number; reviewerId: string; reviewerName: string;
  requestedByName: string; decision: ReviewDecision; comment?: string; requestedAt: string; decidedAt?: string;
}
export interface DocumentDetail extends DocumentSummary { versions: VersionDTO[]; reviews: ReviewDTO[] }

export type DocAction =
  | 'SUBIR' | 'NUEVA_VERSION' | 'VER' | 'DESCARGAR' | 'COMPARTIR' | 'EDITADO' | 'REVISION_SOLICITADA' | 'REVISION_DECIDIDA'
  | 'CREADO' | 'VERSION_CREADA' | 'VISTO' | 'DESCARGADO' | 'COMPARTIDO';
export interface AccessLogDTO {
  id: string; action: DocAction; userId: string; userName: string; versionNumber?: number;
  ip?: string; channel?: string; createdAt: string; detail?: string;
}

export interface EditorSessionResponse {
  documentServerUrl: string;
  scriptUrl: string;
  modo: 'EDICION' | 'LECTURA';
  config: {
    documentType: 'word' | 'cell' | 'slide';
    document: {
      fileType: string;
      key: string;
      title: string;
      url: string;
      permissions: {
        edit: boolean;
        download: boolean;
        print: boolean;
        review: boolean;
        comment: boolean;
      };
    };
    editorConfig: {
      mode: 'edit' | 'view';
      lang: string;
      callbackUrl: string;
      user: { id: string; name: string };
      customization?: Record<string, unknown>;
    };
    token: string;
  };
}

export interface AttachmentDTO {
  documentId: string; versionId: string; versionNumber: number; fileName: string; mimeType: string; sizeBytes: number;
}
export interface MessageDTO {
  id: string; conversationId: string; authorId: string; authorName: string;
  content?: string; attachments: AttachmentDTO[]; createdAt: string;
  /** Fotos del mensaje (PNG, JPEG, GIF o WebP). */
  images?: ImageDTO[];
  /** Mensaje al que se responde, resumido. */
  replyToId?: string;
  replyTo?: QuoteDTO;
  /** Fecha y hora de la última edición (solo si se editó). */
  editedAt?: string;
  /** Solo en MIS mensajes: un acuse por destinatario, con fecha y hora de entrega y de lectura. */
  receipts?: ReceiptDTO[];
  // Solo prototipo (aún sin soporte en backend):
  kind?: 'text' | 'voice' | 'image';
  voiceSeconds?: number;
  imageSeed?: number;
}
export interface ImageDTO {
  id: string; fileName: string; mimeType: string; sizeBytes: number; width: number; height: number;
  /** Solo en el modo demostración (sin servidor): la imagen ya está en el navegador. */
  url?: string;
}
export interface QuoteDTO { id: string; authorId: string; authorName: string; text: string; kind: 'TEXT' | 'IMAGE' | 'DOCUMENT' }
export interface ReceiptDTO { userId: string; userName: string; deliveredAt: string | null; readAt: string | null }
export interface MessageTraceDTO {
  messageId: string; sentAt: string; status: 'SENT' | 'DELIVERED' | 'READ';
  receipts: ReceiptDTO[];
  edits: Array<{ at: string; editorId: string; previousContent?: string }>;
}
/** Novedad de acuses que el servidor envía a quien escribió los mensajes. */
export interface ReceiptUpdateDTO {
  conversationId: string; userId: string; userName: string;
  items: Array<{ messageId: string; deliveredAt: string | null; readAt: string | null }>;
}
/** Una página del historial: `items` cronológicos; `nextCursor` pide la página anterior (null = no hay más). */
export interface MessagePageDTO { items: MessageDTO[]; nextCursor: string | null }
export interface ConversationDTO {
  id: string; type: 'DIRECT' | 'GROUP'; name: string; members: UserLite[];
  lastMessage?: { text: string; at: string }; unread: number;
  // Solo prototipo:
  pinned?: boolean; muted?: boolean; online?: boolean; lastSeen?: string;
}

/** "1.0" (subida) · "1.1", "1.2" (ediciones en línea) · "2.0" (archivo nuevo). */
export const etiquetaDoc = (d: { version: number; versionMenor?: number; versionEtiqueta?: string }) =>
  d.versionEtiqueta ?? `${d.version}.${d.versionMenor ?? 0}`;
export const etiquetaVersion = (v: { versionNumber: number; versionMenor?: number; etiqueta?: string }) =>
  v.etiqueta ?? `${v.versionNumber}.${v.versionMenor ?? 0}`;
