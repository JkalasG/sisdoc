/**
 * ÚNICO punto de contacto del módulo `files` con el resto del sistema.
 * Otros módulos (chat, posts...) importan SOLO este archivo, nunca el interior de files/.
 */
export const DOCUMENTS_API = Symbol('DOCUMENTS_API');

export interface AttachableDocument {
  documentId: string;
  versionId: string;
  versionNumber: number;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
}

export interface DocumentsApi {
  /** Verifica que `userId` pueda ver el documento y devuelve la versión exacta a adjuntar. */
  getAttachable(input: { documentId: string; versionId?: string; userId: string }): Promise<AttachableDocument>;

  /**
   * Da acceso de descarga a los destinatarios y deja constancia (acción SHARE)
   * con el canal de origen, p. ej. "chat:<conversationId>".
   */
  shareWithUsers(input: {
    documentId: string; versionId: string; sharedById: string; recipientIds: string[]; channel: string;
  }): Promise<void>;
}
