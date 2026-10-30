import { Inject, Injectable } from '@nestjs/common';
import { NotFoundError } from '../../../shared/domain/domain-error';
import { AttachableDocument, DocumentsApi } from '../files.contract';
import { assertAccess } from '../domain/document';
import {
  ACCESS_LOG_REPOSITORY, AccessLogRepository, DOCUMENT_REPOSITORY, DocumentRepository,
} from '../domain/ports';

/** Implementa el contrato público que consumen otros módulos. */
@Injectable()
export class DocumentsApiService implements DocumentsApi {
  constructor(
    @Inject(DOCUMENT_REPOSITORY) private readonly docs: DocumentRepository,
    @Inject(ACCESS_LOG_REPOSITORY) private readonly logs: AccessLogRepository,
  ) {}

  async getAttachable(input: { documentId: string; versionId?: string; userId: string }): Promise<AttachableDocument> {
    const doc = await this.docs.findById(input.documentId);
    const share = doc ? await this.docs.getSharePermission(doc.id, input.userId) : null;
    // para reenviar un documento hay que poder descargarlo
    assertAccess(doc, input.userId, share, 'DESCARGAR');

    const versionId = input.versionId ?? doc.versionVigenteId;
    const v = versionId ? await this.docs.findVersion(doc.id, versionId) : null;
    if (!v) throw new NotFoundError('Versión');
    return {
      documentId: doc.id, versionId: v.id, versionNumber: v.versionNumber,
      fileName: v.fileName, mimeType: v.mimeType, sizeBytes: v.sizeBytes,
    };
  }

  async shareWithUsers(input: {
    documentId: string; versionId: string; sharedById: string; recipientIds: string[]; channel: string;
  }): Promise<void> {
    const recipients = [...new Set(input.recipientIds.filter((id) => id !== input.sharedById))];
    await Promise.all(
      recipients.map(async (userId) => {
        const current = await this.docs.getSharePermission(input.documentId, userId);
        if (current === 'DESCARGAR' || current === 'EDITAR') return; // no degradar permisos
        await this.docs.upsertShare({
          documentId: input.documentId, userId, permission: 'DESCARGAR', sharedById: input.sharedById,
        });
        await this.logs.append({
          documentId: input.documentId, versionId: input.versionId, userId: input.sharedById,
          action: 'COMPARTIR', channel: input.channel, metadata: { recipientId: userId, permission: 'DESCARGAR' },
        });
      }),
    );
  }
}
