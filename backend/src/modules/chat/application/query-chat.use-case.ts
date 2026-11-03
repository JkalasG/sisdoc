import { Inject, Injectable } from '@nestjs/common';
import { ForbiddenError } from '../../../shared/domain/domain-error';
import {
  CONVERSATION_REPOSITORY, ConversationRepository, Message, MESSAGE_REPOSITORY, MessageRepository, MessageView,
} from '../domain/ports';

/** Lectura del chat para la API REST (el tiempo real sigue por el socket). */
@Injectable()
export class QueryChatUseCase {
  constructor(
    @Inject(CONVERSATION_REPOSITORY) private readonly conversations: ConversationRepository,
    @Inject(MESSAGE_REPOSITORY) private readonly messages: MessageRepository,
  ) {}

  conversationsOf(userId: string) {
    return this.conversations.listForUser(userId);
  }

  /** Devuelve los mensajes y marca la conversación como leída para quien la abre. */
  async messagesOf(input: { conversationId: string; userId: string }): Promise<MessageView[]> {
    const members = await this.conversations.getMemberIds(input.conversationId);
    if (!members.includes(input.userId)) throw new ForbiddenError('No perteneces a esta conversación');
    const list = await this.messages.listByConversation(input.conversationId);
    await this.conversations.markRead(input.conversationId, input.userId);
    return list;
  }

  async withAuthor(message: Message): Promise<MessageView> {
    return { ...message, authorName: await this.messages.authorName(message.authorId) };
  }
}
