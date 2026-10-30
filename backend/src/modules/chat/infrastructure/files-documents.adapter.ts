import { Inject, Injectable } from '@nestjs/common';
// ÚNICO import permitido hacia el módulo files: su API pública.
import { DOCUMENTS_API, DocumentsApi } from '../../files/files.public-api';
import { DocumentsPort, MessageAttachment } from '../domain/ports';

/** Capa anticorrupción: traduce el contrato de files al vocabulario de chat. */
@Injectable()
export class FilesDocumentsAdapter implements DocumentsPort {
  constructor(@Inject(DOCUMENTS_API) private readonly files: DocumentsApi) {}

  async resolveAttachment(input: { documentId: string; versionId?: string; userId: string }): Promise<MessageAttachment> {
    const d = await this.files.getAttachable(input);
    return {
      documentId: d.documentId, versionId: d.versionId,
      fileName: d.fileName, mimeType: d.mimeType, sizeBytes: d.sizeBytes,
    };
  }

  shareWithRecipients(i: { attachment: MessageAttachment; senderId: string; recipientIds: string[]; conversationId: string }) {
    return this.files.shareWithUsers({
      documentId: i.attachment.documentId, versionId: i.attachment.versionId,
      sharedById: i.senderId, recipientIds: i.recipientIds, channel: `chat:${i.conversationId}`,
    });
  }
}
