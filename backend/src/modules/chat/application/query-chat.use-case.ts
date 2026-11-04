import { Inject, Injectable } from '@nestjs/common';
import { ForbiddenError, NotFoundError, ValidationError } from '../../../shared/domain/domain-error';
import { clampPageSize, decodeCursor, encodeCursor } from '../domain/message-cursor';
import { CONVERSATION_REPOSITORY, ConversationRepository, MESSAGE_REPOSITORY, MessageRepository, MessageView } from '../domain/ports';
import { MarkReadUseCase } from './mark-read.use-case';

export interface MessagePage { items: MessageView[]; nextCursor: string | null }

/** Lectura del chat para la API REST (el tiempo real sigue por el socket). */
@Injectable()
export class QueryChatUseCase {
  constructor(
    @Inject(CONVERSATION_REPOSITORY) private readonly conversations: ConversationRepository,
    @Inject(MESSAGE_REPOSITORY) private readonly messages: MessageRepository,
    private readonly markRead: MarkReadUseCase,
  ) {}

  conversationsOf(userId: string) {
    return this.conversations.listForUser(userId);
  }

  conversationIdsOf(userId: string) {
    return this.conversations.idsForUser(userId);
  }

  memberIdsOf(conversationId: string) {
    return this.conversations.getMemberIds(conversationId);
  }

  /**
   * Una página del historial (de más nuevo a más viejo, página a página). Solo abrir la conversación
   * (primera página, sin cursor) la marca como leída; pedir páginas antiguas no toca el estado de lectura.
   */
  async messagesOf(input: { conversationId: string; userId: string; before?: string; limit?: number }): Promise<MessagePage> {
    const members = await this.conversations.getMemberIds(input.conversationId);
    if (!members.includes(input.userId)) throw new ForbiddenError('No perteneces a esta conversación');
    const before = input.before ? decodeCursor(input.before) : undefined;
    if (input.before && !before) throw new ValidationError('Cursor de paginación inválido');
    const page = await this.messages.listPage({
      conversationId: input.conversationId, before: before ?? undefined, limit: clampPageSize(input.limit), viewerId: input.userId,
    });
    if (!before) await this.markRead.markAsRead({ conversationId: input.conversationId, userId: input.userId });
    const oldest = page.items[0];
    return { items: page.items, nextCursor: page.hasMore && oldest ? encodeCursor({ at: oldest.createdAt, id: oldest.id }) : null };
  }

  /** Un mensaje listo para mostrar. Con `viewerId` igual al autor, incluye los acuses de sus destinatarios. */
  async messageView(messageId: string, viewerId?: string): Promise<MessageView> {
    const view = await this.messages.view(messageId, viewerId);
    if (!view) throw new NotFoundError('Mensaje');
    return view;
  }
}
