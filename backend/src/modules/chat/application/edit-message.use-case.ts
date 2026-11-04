import { Inject, Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ForbiddenError, NotFoundError, ValidationError } from '../../../shared/domain/domain-error';
import {
  CONVERSATION_REPOSITORY, ConversationRepository, MESSAGE_REPOSITORY, MessageRepository, MessageView,
} from '../domain/ports';
import { canEditMessage, EDIT_POLICY } from '../domain/receipt';

/** Edita el texto de un mensaje propio, solo si es uno de los últimos 3 que la persona envió en esa conversación. */
@Injectable()
export class EditMessageUseCase {
  constructor(
    @Inject(CONVERSATION_REPOSITORY) private readonly conversations: ConversationRepository,
    @Inject(MESSAGE_REPOSITORY) private readonly messages: MessageRepository,
    private readonly events: EventEmitter2,
  ) {}

  async execute(input: { conversationId: string; messageId: string; editorId: string; content: string }): Promise<MessageView> {
    const members = await this.conversations.getMemberIds(input.conversationId);
    if (!members.includes(input.editorId)) throw new ForbiddenError('No perteneces a esta conversación');
    const brief = await this.messages.brief(input.messageId);
    if (!brief || brief.conversationId !== input.conversationId) throw new NotFoundError('Mensaje');
    if (brief.authorId !== input.editorId) throw new ForbiddenError('Solo puedes editar tus propios mensajes');

    const recent = await this.messages.recentIdsByAuthor(input.conversationId, input.editorId, EDIT_POLICY.lastMessages);
    if (!canEditMessage(input.messageId, recent)) {
      throw new ForbiddenError(`Solo puedes editar tus últimos ${EDIT_POLICY.lastMessages} mensajes de esta conversación`);
    }

    if (typeof input.content !== 'string') throw new ValidationError('El mensaje debe ser texto');
    const content = input.content.trim();
    if (content.length > EDIT_POLICY.maxChars) throw new ValidationError(`El mensaje no puede superar ${EDIT_POLICY.maxChars} caracteres`);
    if (!content && !brief.hasMedia) throw new ValidationError('El mensaje no puede quedar vacío');
    if (content === (brief.content ?? '').trim()) throw new ValidationError('No hay cambios que guardar');

    await this.messages.applyEdit({ messageId: input.messageId, editorId: input.editorId, previousContent: brief.content, content });
    const shared = await this.messages.view(input.messageId); // sin acuses: lo recibe toda la sala
    this.events.emit('chat.message.edited', shared);
    return (await this.messages.view(input.messageId, input.editorId))!;
  }
}
