import { Inject, Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ForbiddenError, ValidationError } from '../../../shared/domain/domain-error';
import {
  CONVERSATION_REPOSITORY, ConversationRepository, DOCUMENTS_PORT, DocumentsPort,
  Message, MESSAGE_REPOSITORY, MessageRepository,
} from '../domain/ports';

@Injectable()
export class SendMessageUseCase {
  constructor(
    @Inject(CONVERSATION_REPOSITORY) private readonly conversations: ConversationRepository,
    @Inject(MESSAGE_REPOSITORY) private readonly messages: MessageRepository,
    @Inject(DOCUMENTS_PORT) private readonly documents: DocumentsPort,
    private readonly events: EventEmitter2,
  ) {}

  async execute(input: {
    conversationId: string; authorId: string; content?: string;
    attachments?: Array<{ documentId: string; versionId?: string }>;
  }): Promise<Message> {
    const members = await this.conversations.getMemberIds(input.conversationId);
    if (!members.includes(input.authorId)) throw new ForbiddenError('No perteneces a esta conversación');
    if (!input.content?.trim() && !input.attachments?.length) throw new ValidationError('Mensaje vacío');

    // 1. El módulo de archivos valida que el autor pueda adjuntar cada documento.
    const resolved = await Promise.all(
      (input.attachments ?? []).map((a) => this.documents.resolveAttachment({ ...a, userId: input.authorId })),
    );

    // 2. Se guarda el mensaje apuntando a la versión exacta.
    const saved = await this.messages.create({
      conversationId: input.conversationId, authorId: input.authorId, content: input.content,
      attachments: resolved.map(({ documentId, versionId }) => ({ documentId, versionId })),
    });

    // 3. Los destinatarios reciben permiso de descarga y queda registro (acción SHARE, canal chat).
    const recipients = members.filter((m) => m !== input.authorId);
    for (const attachment of resolved) {
      await this.documents.shareWithRecipients({
        attachment, senderId: input.authorId, recipientIds: recipients, conversationId: input.conversationId,
      });
    }

    const message: Message = {
      id: saved.id, conversationId: input.conversationId, authorId: input.authorId,
      content: input.content, attachments: resolved, createdAt: saved.createdAt,
    };
    this.events.emit('chat.message.sent', message); // notificaciones y otros módulos escuchan esto
    return message;
  }
}
