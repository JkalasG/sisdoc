import { Inject, Injectable } from '@nestjs/common';
import { ForbiddenError, NotFoundError, ValidationError } from '../../../shared/domain/domain-error';
import { assertAccess, ReviewDecision, statusAfterDecision } from '../domain/document';
import {
  ACCESS_LOG_REPOSITORY, AccessLogRepository, DOCUMENT_REPOSITORY, DocumentRepository,
} from '../domain/ports';

@Injectable()
export class ReviewDocumentUseCase {
  constructor(
    @Inject(DOCUMENT_REPOSITORY) private readonly docs: DocumentRepository,
    @Inject(ACCESS_LOG_REPOSITORY) private readonly logs: AccessLogRepository,
  ) {}

  async request(input: { documentId: string; versionId?: string; reviewerId: string; userId: string }) {
    const doc = await this.docs.findById(input.documentId);
    const share = doc ? await this.docs.getSharePermission(doc.id, input.userId) : null;
    assertAccess(doc, input.userId, share, 'EDITAR');

    const versionId = input.versionId ?? doc.versionVigenteId;
    if (!versionId) throw new ValidationError('El documento no tiene versiones');
    const version = await this.docs.findVersion(doc.id, versionId);
    if (!version) throw new NotFoundError('Versión');

    // el revisor necesita poder ver y descargar para revisar
    await this.docs.upsertShare({
      documentId: doc.id, userId: input.reviewerId, permission: 'DESCARGAR', sharedById: input.userId,
    });
    const review = await this.docs.createReview({
      documentId: doc.id, versionId, reviewerId: input.reviewerId, requestedBy: input.userId,
    });
    await this.docs.setStatus(doc.id, 'EN_REVISION', input.userId, input.reviewerId); // el revisor asignado queda en el registro
    await this.logs.append({
      documentId: doc.id, versionId, userId: input.userId, action: 'REVISION_SOLICITADA',
      metadata: { reviewId: review.id, reviewerId: input.reviewerId },
    });
    return review;
  }

  async decide(input: { reviewId: string; userId: string; decision: Exclude<ReviewDecision, 'PENDIENTE'>; comment?: string }) {
    const review = await this.docs.findReview(input.reviewId);
    if (!review) throw new NotFoundError('Revisión');
    if (review.reviewerId !== input.userId) throw new ForbiddenError('Solo el revisor asignado puede decidir');
    if (review.decision !== 'PENDIENTE') throw new ValidationError('La revisión ya fue resuelta');

    await this.docs.decideReview(review.id, input.decision, input.comment);
    await this.docs.setStatus(review.documentId, statusAfterDecision(input.decision), input.userId, input.userId);
    await this.logs.append({
      documentId: review.documentId, versionId: review.versionId, userId: input.userId,
      action: 'REVISION_DECIDIDA', metadata: { reviewId: review.id, decision: input.decision, comment: input.comment },
    });
  }
}
