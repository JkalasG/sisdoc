import { Inject, Injectable } from '@nestjs/common';
import { NotFoundError } from '../../../shared/domain/domain-error';
import { assertAccess } from '../domain/document';
import {
  ACCESS_LOG_REPOSITORY, AccessLogRepository, DOCUMENT_REPOSITORY, DocumentRepository,
  FILE_STORAGE, FileStorage,
} from '../domain/ports';

@Injectable()
export class DownloadDocumentUseCase {
  constructor(
    @Inject(DOCUMENT_REPOSITORY) private readonly docs: DocumentRepository,
    @Inject(ACCESS_LOG_REPOSITORY) private readonly logs: AccessLogRepository,
    @Inject(FILE_STORAGE) private readonly storage: FileStorage,
  ) {}

  async execute(input: {
    documentId: string; versionId?: string; userId: string;
    channel?: string; ip?: string; userAgent?: string;
  }) {
    const doc = await this.docs.findById(input.documentId);
    const share = doc ? await this.docs.getSharePermission(doc.id, input.userId) : null;
    assertAccess(doc, input.userId, share, 'DESCARGAR');

    const versionId = input.versionId ?? doc.versionVigenteId;
    const version = versionId ? await this.docs.findVersion(doc.id, versionId) : null;
    if (!version) throw new NotFoundError('Versión');

    // Primero se registra, después se entrega el archivo: si el log falla, no hay descarga.
    await this.logs.append({
      documentId: doc.id, versionId: version.id, userId: input.userId, action: 'DESCARGAR',
      ip: input.ip, userAgent: input.userAgent, channel: input.channel ?? 'archivos',
      metadata: { versionNumber: version.versionNumber, checksum: version.checksumSha256 },
    });

    return {
      stream: await this.storage.read(version.storageKey),
      fileName: version.fileName,
      mimeType: version.mimeType,
      sizeBytes: version.sizeBytes,
      checksumSha256: version.checksumSha256,
    };
  }
}
