import { Inject, Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ForbiddenError } from '../../../shared/domain/domain-error';
import { CONVERSATION_REPOSITORY, ConversationRepository, RECEIPT_REPOSITORY, ReceiptRepository } from '../domain/ports';

/** Marca la conversación como leída y deja constancia, con fecha y hora, del «leído» de cada mensaje. */
@Injectable()
export class MarkReadUseCase {
  constructor(
    @Inject(CONVERSATION_REPOSITORY) private readonly conversations: ConversationRepository,
    @Inject(RECEIPT_REPOSITORY) private readonly receipts: ReceiptRepository,
    private readonly events: EventEmitter2,
  ) {}

  async execute(input: { conversationId: string; userId: string }): Promise<void> {
    const members = await this.conversations.getMemberIds(input.conversationId);
    if (!members.includes(input.userId)) throw new ForbiddenError('No perteneces a esta conversación');
    await this.markAsRead(input);
  }

  /** Para quien ya comprobó la pertenencia. */
  async markAsRead(input: { conversationId: string; userId: string }): Promise<void> {
    await this.conversations.markRead(input.conversationId, input.userId);
    const updates = await this.receipts.markRead(input);
    if (updates.length) this.events.emit('chat.receipts.updated', updates); // a quien envió le llega el «leído» en vivo
  }
}
