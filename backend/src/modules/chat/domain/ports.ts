import { ImageInfo } from './image';
import { MessageCursor } from './message-cursor';
import { Receipt, ReceiptUpdate } from './receipt';

export const CONVERSATION_REPOSITORY = Symbol('CONVERSATION_REPOSITORY');
export const MESSAGE_REPOSITORY = Symbol('MESSAGE_REPOSITORY');
export const RECEIPT_REPOSITORY = Symbol('RECEIPT_REPOSITORY');
export const IMAGE_REPOSITORY = Symbol('IMAGE_REPOSITORY');
export const IMAGE_STORAGE = Symbol('IMAGE_STORAGE');
/** Directorio de personas con las que se puede chatear. Chat no conoce el módulo de usuarios: solo este puerto. */
export const CONTACTS_PORT = Symbol('CONTACTS_PORT');
/** Puerto hacia el módulo de archivos. Chat solo conoce ESTE contrato, no el módulo files. */
export const DOCUMENTS_PORT = Symbol('DOCUMENTS_PORT');

export interface MessageAttachment {
  documentId: string;
  versionId: string;
  versionNumber: number;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
}

/** Imagen enviada por el chat (el archivo vive en el almacenamiento; aquí solo su descripción). */
export interface MessageImage {
  id: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  width: number;
  height: number;
}

/** El mensaje al que se responde, resumido para mostrarlo citado. */
export interface MessageQuote {
  id: string;
  authorId: string;
  authorName: string;
  text: string;
  kind: 'TEXT' | 'IMAGE' | 'DOCUMENT';
}

export interface Message {
  id: string;
  conversationId: string;
  authorId: string;
  content?: string;
  attachments: MessageAttachment[];
  images: MessageImage[];
  replyToId?: string;
  editedAt?: Date;
  createdAt: Date;
}

export interface MessageView extends Message {
  authorName: string;
  replyTo?: MessageQuote;
  /** Solo lo ve quien envió el mensaje: nadie más debe saber quién lo leyó ni cuándo. */
  receipts?: Receipt[];
}

export interface ConversationSummary {
  id: string;
  type: 'DIRECT' | 'GROUP';
  name: string;
  members: Array<{ id: string; name: string; email: string }>;
  lastMessage?: { text: string; at: Date };
  unread: number;
}

export interface Contact { id: string; name: string; email: string }

export interface ContactsPort {
  /** Usuarios ACTIVOS (nunca el que pregunta), filtrados por nombre o correo, ordenados por nombre. */
  search(input: { exceptUserId: string; q?: string; limit: number }): Promise<Contact[]>;
  /** De estos ids, los que son usuarios activos. */
  activeIds(ids: string[]): Promise<string[]>;
}

export interface ConversationRepository {
  getMemberIds(conversationId: string): Promise<string[]>;
  idsForUser(userId: string): Promise<string[]>;
  /** Chat directo ya existente entre dos personas, si lo hay. */
  findDirect(a: string, b: string): Promise<string | null>;
  /** Crea la conversación con sus miembros. En un directo duplicado (carrera) devuelve el existente. */
  create(input: { type: 'DIRECT' | 'GROUP'; name?: string; memberIds: string[] }): Promise<{ id: string; created: boolean }>;
  summaryFor(conversationId: string, userId: string): Promise<ConversationSummary | null>;
  listForUser(userId: string): Promise<ConversationSummary[]>;
  markRead(conversationId: string, userId: string): Promise<void>;
}

export interface MessageRepository {
  /** Guarda el mensaje con un acuse pendiente por destinatario y enlaza las imágenes subidas. Todo o nada. */
  create(input: {
    conversationId: string; authorId: string; content?: string;
    attachments: Array<{ documentId: string; versionId: string }>;
    imageIds: string[]; replyToId?: string; recipientIds: string[];
  }): Promise<{ id: string; createdAt: Date }>;
  /**
   * Una página del historial: los `limit` mensajes más recientes anteriores a `before` (o los últimos si no hay),
   * en orden cronológico ascendente. `hasMore` indica si quedan mensajes más antiguos.
   * Con `viewerId`, los mensajes de esa persona incluyen los acuses de sus destinatarios.
   */
  listPage(input: { conversationId: string; before?: MessageCursor; limit: number; viewerId?: string }): Promise<{ items: MessageView[]; hasMore: boolean }>;
  /** Un mensaje completo (con imágenes, cita y, si `viewerId` es el autor, sus acuses). */
  view(messageId: string, viewerId?: string): Promise<MessageView | null>;
  /** Datos mínimos para validar respuestas y ediciones. */
  brief(messageId: string): Promise<{ id: string; conversationId: string; authorId: string; content?: string; hasMedia: boolean } | null>;
  /** Ids de los mensajes más recientes de `authorId` en la conversación, del más nuevo al más viejo. */
  recentIdsByAuthor(conversationId: string, authorId: string, limit: number): Promise<string[]>;
  /** Cambia el texto y conserva el anterior (historial de ediciones, solo se agrega). */
  applyEdit(input: { messageId: string; editorId: string; previousContent?: string; content: string }): Promise<{ editedAt: Date }>;
  /** Hitos del mensaje para auditoría: acuses por destinatario y cada edición con su fecha. */
  trace(messageId: string): Promise<{ receipts: Receipt[]; edits: Array<{ at: Date; editorId: string; previousContent?: string }> }>;
  authorName(userId: string): Promise<string>;
}

export interface ReceiptRepository {
  /** Marca como ENTREGADOS (si aún no lo estaban) los mensajes de esta persona; solo registra la primera vez. */
  markDelivered(input: { userId: string; messageId?: string; conversationId?: string }): Promise<ReceiptUpdate[]>;
  /** Marca como LEÍDOS (y entregados, si faltaba) los mensajes ajenos de la conversación. */
  markRead(input: { conversationId: string; userId: string }): Promise<ReceiptUpdate[]>;
}

export interface StagedImage extends MessageImage {
  conversationId: string;
  uploaderId: string;
  storageKey: string;
  messageId?: string;
}

export interface ImageRepository {
  create(input: Omit<StagedImage, 'id' | 'messageId'>): Promise<StagedImage>;
  find(id: string): Promise<StagedImage | null>;
  /** Cuántas subidas sin enviar tiene esta persona en la conversación. */
  countStaged(conversationId: string, uploaderId: string): Promise<number>;
  /** De estos ids, los que esta persona subió a esta conversación y aún no se usaron. */
  findStaged(ids: string[], conversationId: string, uploaderId: string): Promise<StagedImage[]>;
}

export interface ImageStorage {
  put(key: string, body: Buffer): Promise<void>;
  read(key: string): Promise<NodeJS.ReadableStream>;
}

export type { ImageInfo };

export interface DocumentsPort {
  resolveAttachment(input: { documentId: string; versionId?: string; userId: string }): Promise<MessageAttachment>;
  shareWithRecipients(input: {
    attachment: MessageAttachment; senderId: string; recipientIds: string[]; conversationId: string;
  }): Promise<void>;
}
