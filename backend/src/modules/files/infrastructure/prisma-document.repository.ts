import { Injectable } from '@nestjs/common';
import { Prisma, DocumentVersion as PrismaVersion, Document as PrismaDocument } from '@prisma/client';
import { ConflictError } from '../../../shared/domain/domain-error';
import { PrismaService } from '../../../shared/infrastructure/prisma/prisma.service';
import {
  Document, DocumentStatus, DocumentVersion, Review, ReviewDecision, SharePermission, tipoUrl, urlDescarga,
} from '../domain/document';
import { DocumentRepository, NewDocument, NewVersion, ReviewRecord, VisibleDocument } from '../domain/ports';

const toDoc = (d: PrismaDocument): Document => ({
  id: d.id, codigo: d.codigo, nombreDocumento: d.nombreDocumento, descripcion: d.descripcion ?? undefined,
  estado: d.estado, gestion: d.gestion, cambios: d.cambios, version: d.version,
  fechaCreacion: d.fechaCreacion, usuarioCreadorId: d.usuarioCreadorId,
  fechaModificacion: d.fechaModificacion, usuarioModificadorId: d.usuarioModificadorId,
  fechaActualizacion: d.fechaActualizacion, usuarioActualizadorId: d.usuarioActualizadorId,
  revisorId: d.revisorId ?? undefined, urlWord: d.urlWord ?? undefined, urlPdf: d.urlPdf ?? undefined,
  versionVigenteId: d.versionVigenteId ?? undefined, eliminado: d.eliminadoEn !== null,
});

const toVersion = (v: PrismaVersion): DocumentVersion => ({
  id: v.id, documentId: v.documentId, versionNumber: v.versionNumber, storageKey: v.storageKey,
  fileName: v.fileName, mimeType: v.mimeType, sizeBytes: Number(v.sizeBytes),
  checksumSha256: v.checksumSha256, changeNote: v.changeNote ?? undefined,
  uploadedById: v.uploadedById, createdAt: v.createdAt,
});

/** Columna de URL que corresponde al archivo (Word → url_word, PDF → url_pdf, otros → ninguna). */
function urlPatch(mimeType: string, documentId: string, versionId: string): Prisma.DocumentUpdateInput {
  const tipo = tipoUrl(mimeType);
  const url = urlDescarga(documentId, versionId);
  return tipo === 'word' ? { urlWord: url } : tipo === 'pdf' ? { urlPdf: url } : {};
}

@Injectable()
export class PrismaDocumentRepository implements DocumentRepository {
  constructor(private readonly prisma: PrismaService) {}

  async createWithFirstVersion(input: NewDocument) {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const ahora = new Date();
        const doc = await tx.document.create({
          data: {
            codigo: input.codigo, nombreDocumento: input.nombreDocumento, descripcion: input.descripcion,
            estado: input.estado, gestion: input.gestion, cambios: 'NO', version: 1,
            fechaCreacion: input.fechaCreacion, usuarioCreadorId: input.usuarioId,
            fechaModificacion: ahora, usuarioModificadorId: input.usuarioId,
            fechaActualizacion: ahora, usuarioActualizadorId: input.usuarioId,
            revisorId: input.revisorId,
          },
        });
        const v = await tx.documentVersion.create({
          data: { ...input.version, documentId: doc.id, versionNumber: 1, sizeBytes: BigInt(input.version.sizeBytes) },
        });
        const updated = await tx.document.update({
          where: { id: doc.id },
          data: { versionVigenteId: v.id, ...urlPatch(v.mimeType, doc.id, v.id) },
        });
        return { document: toDoc(updated), version: toVersion(v) };
      });
    } catch (e) {
      // carrera entre dos cargas con el mismo código: la restricción única de la BD es la última defensa
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new ConflictError(`Ya existe un documento con el código ${input.codigo}`);
      }
      throw e;
    }
  }

  async addVersion(documentId: string, version: NewVersion) {
    return this.prisma.$transaction(async (tx) => {
      const last = await tx.documentVersion.aggregate({ where: { documentId }, _max: { versionNumber: true } });
      const numero = (last._max.versionNumber ?? 0) + 1;
      const v = await tx.documentVersion.create({
        data: { ...version, documentId, versionNumber: numero, sizeBytes: BigInt(version.sizeBytes) },
        // @@unique([documentId, versionNumber]) protege ante concurrencia
      });
      const ahora = new Date();
      await tx.document.update({
        where: { id: documentId },
        data: {
          versionVigenteId: v.id, version: numero, cambios: 'SI',
          fechaActualizacion: ahora, usuarioActualizadorId: version.uploadedById,
          fechaModificacion: ahora, usuarioModificadorId: version.uploadedById,
          ...urlPatch(v.mimeType, documentId, v.id),
        },
      });
      return toVersion(v);
    });
  }

  async findById(id: string) {
    const d = await this.prisma.document.findUnique({ where: { id } });
    return d ? toDoc(d) : null;
  }

  async findByCodigo(codigo: string) {
    const d = await this.prisma.document.findUnique({ where: { codigo } });
    return d ? toDoc(d) : null;
  }

  async findVersion(documentId: string, versionId: string) {
    const v = await this.prisma.documentVersion.findFirst({ where: { id: versionId, documentId } });
    return v ? toVersion(v) : null;
  }

  async listVersions(documentId: string) {
    const rows = await this.prisma.documentVersion.findMany({ where: { documentId }, orderBy: { versionNumber: 'desc' } });
    return rows.map(toVersion);
  }

  async listReviews(documentId: string): Promise<ReviewRecord[]> {
    const rows = await this.prisma.documentReview.findMany({ where: { documentId }, orderBy: { requestedAt: 'desc' } });
    return rows.map((r) => ({
      id: r.id, documentId: r.documentId, versionId: r.versionId, reviewerId: r.reviewerId,
      requestedBy: r.requestedBy, decision: r.decision, comment: r.comment ?? undefined,
      requestedAt: r.requestedAt, decidedAt: r.decidedAt ?? undefined,
    }));
  }

  async listVisible(userId: string): Promise<VisibleDocument[]> {
    const ahora = new Date();
    const rows = await this.prisma.document.findMany({
      where: {
        eliminadoEn: null,
        OR: [
          { usuarioCreadorId: userId },
          { shares: { some: { userId, OR: [{ expiresAt: null }, { expiresAt: { gt: ahora } }] } } },
        ],
      },
      include: { shares: { where: { userId } } },
      orderBy: { fechaModificacion: 'desc' },
    });
    return rows.map((r) => ({
      document: toDoc(r),
      permission: r.usuarioCreadorId === userId ? 'PROPIETARIO' : (r.shares[0]?.permission ?? 'VER'),
    }));
  }

  async getSharePermission(documentId: string, userId: string): Promise<SharePermission | null> {
    const s = await this.prisma.documentShare.findUnique({ where: { documentId_userId: { documentId, userId } } });
    if (!s || (s.expiresAt && s.expiresAt < new Date())) return null;
    return s.permission;
  }

  async upsertShare(i: { documentId: string; userId: string; permission: SharePermission; sharedById: string }) {
    await this.prisma.documentShare.upsert({
      where: { documentId_userId: { documentId: i.documentId, userId: i.userId } },
      update: { permission: i.permission, sharedById: i.sharedById },
      create: i,
    });
  }

  async setStatus(documentId: string, estado: DocumentStatus, usuarioId: string, revisorId?: string) {
    await this.prisma.document.update({
      where: { id: documentId },
      data: { estado, fechaModificacion: new Date(), usuarioModificadorId: usuarioId, ...(revisorId ? { revisorId } : {}) },
    });
  }

  async createReview(i: { documentId: string; versionId: string; reviewerId: string; requestedBy: string }): Promise<Review> {
    const r = await this.prisma.documentReview.create({ data: i });
    return { ...r, decision: r.decision };
  }

  async findReview(reviewId: string): Promise<Review | null> {
    const r = await this.prisma.documentReview.findUnique({ where: { id: reviewId } });
    return r ? { ...r, decision: r.decision } : null;
  }

  async decideReview(reviewId: string, decision: ReviewDecision, comment?: string) {
    await this.prisma.documentReview.update({
      where: { id: reviewId }, data: { decision, comment, decidedAt: new Date() },
    });
  }
}
