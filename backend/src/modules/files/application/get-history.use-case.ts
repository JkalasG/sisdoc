import { Inject, Injectable } from '@nestjs/common';
import { ForbiddenError } from '../../../shared/domain/domain-error';
import { assertAccess } from '../domain/document';
import {
  ACCESS_LOG_REPOSITORY, AccessLogRepository, DOCUMENT_REPOSITORY, DocumentRepository, USER_DIRECTORY, UserDirectory,
} from '../domain/ports';

@Injectable()
export class GetHistoryUseCase {
  constructor(
    @Inject(DOCUMENT_REPOSITORY) private readonly docs: DocumentRepository,
    @Inject(ACCESS_LOG_REPOSITORY) private readonly logs: AccessLogRepository,
    @Inject(USER_DIRECTORY) private readonly users: UserDirectory,
  ) {}

  /** Trazabilidad completa: quién subió, vio, descargó, editó, compartió y revisó. Solo el dueño. */
  async execute(input: { documentId: string; userId: string; take?: number; cursor?: string }) {
    const doc = await this.docs.findById(input.documentId);
    const share = doc ? await this.docs.getSharePermission(doc.id, input.userId) : null;
    assertAccess(doc, input.userId, share, 'VER'); // quien no ve el documento recibe 404
    if (doc.usuarioCreadorId !== input.userId) throw new ForbiddenError(); // luego: o rol auditor (audit.read)

    const [entries, versions] = await Promise.all([
      this.logs.listByDocument(doc.id, { take: Math.min(input.take ?? 50, 200), cursor: input.cursor }),
      this.docs.listVersions(doc.id),
    ]);
    const names = await this.users.namesOf(entries.map((e) => e.userId));
    const versionMap = new Map(versions.map((v) => [v.id, v.versionNumber]));

    return entries.map((e) => ({
      ...e,
      userName: names.get(e.userId) ?? 'Usuario',
      versionNumber: e.versionId ? versionMap.get(e.versionId) : undefined,
      detail: typeof e.metadata?.changeNote === 'string'
        ? e.metadata.changeNote
        : typeof e.metadata?.decision === 'string'
          ? String(e.metadata.decision)
          : typeof e.metadata?.modo === 'string'
            ? `Modo ${String(e.metadata.modo).toLowerCase()}`
            : undefined,
    }));
  }
}
