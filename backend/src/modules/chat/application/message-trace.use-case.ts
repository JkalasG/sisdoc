import { Inject, Injectable } from '@nestjs/common';
import { ForbiddenError, NotFoundError } from '../../../shared/domain/domain-error';
import { CONVERSATION_REPOSITORY, ConversationRepository, MESSAGE_REPOSITORY, MessageRepository } from '../domain/ports';
import { deliveryStatus, DeliveryStatus, Receipt } from '../domain/receipt';

export interface MessageTrace {
  messageId: string;
  sentAt: Date;
  status: DeliveryStatus;
  receipts: Receipt[];
  edits: Array<{ at: Date; editorId: string; previousContent?: string }>;
}

/** Trazabilidad de un mensaje: enviado, entregado y leído por destinatario (con fecha y hora) y sus ediciones. */
@Injectable()
export class MessageTraceUseCase {
  constructor(
    @Inject(CONVERSATION_REPOSITORY) private readonly conversations: ConversationRepository,
    @Inject(MESSAGE_REPOSITORY) private readonly messages: MessageRepository,
  ) {}

  async execute(input: { conversationId: string; messageId: string; userId: string }): Promise<MessageTrace> {
    const members = await this.conversations.getMemberIds(input.conversationId);
    if (!members.includes(input.userId)) throw new ForbiddenError('No perteneces a esta conversación');
    const brief = await this.messages.brief(input.messageId);
    if (!brief || brief.conversationId !== input.conversationId) throw new NotFoundError('Mensaje');
    // Quién lo leyó y cuándo es información de quien lo envió; los demás miembros no la ven.
    if (brief.authorId !== input.userId) throw new ForbiddenError('Solo quien envió el mensaje puede ver su historial de entrega');
    const [view, trace] = await Promise.all([this.messages.view(input.messageId), this.messages.trace(input.messageId)]);
    return { messageId: input.messageId, sentAt: view!.createdAt, status: deliveryStatus(trace.receipts), receipts: trace.receipts, edits: trace.edits };
  }
}
