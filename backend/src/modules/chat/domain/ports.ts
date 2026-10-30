export const CONVERSATION_REPOSITORY = Symbol('CONVERSATION_REPOSITORY');
export const MESSAGE_REPOSITORY = Symbol('MESSAGE_REPOSITORY');
/** Puerto hacia el módulo de archivos. Chat solo conoce ESTE contrato, no el módulo files. */
export const DOCUMENTS_PORT = Symbol('DOCUMENTS_PORT');

export interface MessageAttachment {
  documentId: string;
  versionId: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
}

export interface Message {
  id: string;
  conversationId: string;
  authorId: string;
  content?: string;
  attachments: MessageAttachment[];
  createdAt: Date;
}

export interface ConversationRepository {
  getMemberIds(conversationId: string): Promise<string[]>;
}

export interface MessageRepository {
  create(input: {
    conversationId: string; authorId: string; content?: string;
    attachments: Array<{ documentId: string; versionId: string }>;
  }): Promise<{ id: string; createdAt: Date }>;
}

export interface DocumentsPort {
  resolveAttachment(input: { documentId: string; versionId?: string; userId: string }): Promise<MessageAttachment>;
  shareWithRecipients(input: {
    attachment: MessageAttachment; senderId: string; recipientIds: string[]; conversationId: string;
  }): Promise<void>;
}
