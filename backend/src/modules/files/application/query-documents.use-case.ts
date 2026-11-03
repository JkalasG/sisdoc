import { Inject, Injectable } from '@nestjs/common';
import { Document, DocumentVersion, assertAccess, etiquetaVersion } from '../domain/document';
import {
  DOCUMENT_REPOSITORY, DocumentRepository, USER_DIRECTORY, UserDirectory, VisibleDocument,
} from '../domain/ports';

const persona = (names: Map<string, string>, id?: string) =>
  id ? { id, nombre: names.get(id) ?? 'Usuario' } : undefined;

const versionDto = (v: DocumentVersion, names: Map<string, string>) => ({
  id: v.id, versionNumber: v.versionNumber, versionMenor: v.versionMenor,
  etiqueta: etiquetaVersion(v.versionNumber, v.versionMenor), fileName: v.fileName, mimeType: v.mimeType, sizeBytes: v.sizeBytes,
  checksumSha256: v.checksumSha256, changeNote: v.changeNote, uploadedById: v.uploadedById,
  uploadedByName: names.get(v.uploadedById) ?? 'Usuario', createdAt: v.createdAt.toISOString(),
});

/** Registro maestro tal como lo ve la pantalla de documentos (campos en español). */
function resumen(d: Document, permission: VisibleDocument['permission'], names: Map<string, string>, vigente?: DocumentVersion) {
  return {
    id: d.id, codigo: d.codigo, nombreDocumento: d.nombreDocumento, descripcion: d.descripcion,
    estado: d.estado, gestion: d.gestion, cambios: d.cambios, version: d.version, versionMenor: d.versionMenor,
    versionEtiqueta: etiquetaVersion(d.version, d.versionMenor),
    fechaCreacion: d.fechaCreacion.toISOString(), usuarioCreador: persona(names, d.usuarioCreadorId)!,
    fechaModificacion: d.fechaModificacion.toISOString(), usuarioModificador: persona(names, d.usuarioModificadorId)!,
    fechaActualizacion: d.fechaActualizacion.toISOString(), usuarioActualizador: persona(names, d.usuarioActualizadorId)!,
    revisor: persona(names, d.revisorId), urlWord: d.urlWord, urlPdf: d.urlPdf,
    miPermiso: permission, versionVigente: vigente ? versionDto(vigente, names) : undefined,
  };
}

@Injectable()
export class QueryDocumentsUseCase {
  constructor(
    @Inject(DOCUMENT_REPOSITORY) private readonly docs: DocumentRepository,
    @Inject(USER_DIRECTORY) private readonly users: UserDirectory,
  ) {}

  /** Documentos que el usuario creó o que le compartieron. */
  async list(userId: string) {
    const visibles = await this.docs.listVisible(userId);
    const ids = visibles.flatMap(({ document: d }) => [d.usuarioCreadorId, d.usuarioModificadorId, d.usuarioActualizadorId, d.revisorId ?? '']);
    const [names, vigentes] = await Promise.all([
      this.users.namesOf(ids.filter(Boolean)),
      Promise.all(
        visibles.map(({ document: d }) =>
          d.versionVigenteId ? this.docs.findVersion(d.id, d.versionVigenteId) : Promise.resolve(null),
        ),
      ),
    ]);
    return visibles.map(({ document: d, permission }, idx) =>
      resumen(d, permission, names, vigentes[idx] ?? undefined),
    );
  }

  /** Detalle con versiones y revisiones. Lo ajeno no existe (404). */
  async detail(input: { documentId: string; userId: string }) {
    const doc = await this.docs.findById(input.documentId);
    const share = doc ? await this.docs.getSharePermission(doc.id, input.userId) : null;
    assertAccess(doc, input.userId, share, 'VER');

    const [versions, reviews] = await Promise.all([this.docs.listVersions(doc.id), this.docs.listReviews(doc.id)]);
    const ids = [
      doc.usuarioCreadorId, doc.usuarioModificadorId, doc.usuarioActualizadorId, doc.revisorId ?? '',
      ...versions.map((v) => v.uploadedById), ...reviews.flatMap((r) => [r.reviewerId, r.requestedBy]),
    ].filter(Boolean);
    const names = await this.users.namesOf(ids);
    const permission = doc.usuarioCreadorId === input.userId ? 'PROPIETARIO' : (share ?? 'VER');
    const vigente = versions.find((v) => v.id === doc.versionVigenteId);

    return {
      ...resumen(doc, permission, names, vigente),
      versions: versions.map((v) => versionDto(v, names)),
      reviews: reviews.map((r) => ({
        id: r.id, versionId: r.versionId, versionNumber: versions.find((v) => v.id === r.versionId)?.versionNumber ?? 0,
        reviewerId: r.reviewerId, reviewerName: names.get(r.reviewerId) ?? 'Usuario',
        requestedByName: names.get(r.requestedBy) ?? 'Usuario', decision: r.decision, comment: r.comment,
        requestedAt: r.requestedAt.toISOString(), decidedAt: r.decidedAt?.toISOString(),
      })),
    };
  }

  /** Directorio de usuarios activos para solicitar revisiones o compartir documentos. */
  async directory(currentUserId: string) {
    return this.users.listActiveUsers ? this.users.listActiveUsers(currentUserId) : [];
  }
}
