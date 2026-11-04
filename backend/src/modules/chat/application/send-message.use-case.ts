import { Inject, Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ForbiddenError, ValidationError } from '../../../shared/domain/domain-error';
import { IMAGE_LIMITS } from '../domain/image';
import {
  CONVERSATION_REPOSITORY, ConversationRepository, DOCUMENTS_PORT, DocumentsPort, IMAGE_REPOSITORY, ImageRepository,
  Message, MESSAGE_REPOSITORY, MessageRepository,
} from '../domain/ports';

export const MESSAGE_LIMITS = { maxChars: 4000, maxAttachments: 10 } as const;

@Injectable()
export class SendMessageUseCase {
  constructor(
    @Inject(CONVERSATION_REPOSITORY) private readonly conversations: ConversationRepository,
    @Inject(MESSAGE_REPOSITORY) private readonly messages: MessageRepository,
    @Inject(DOCUMENTS_PORT) private readonly documents: DocumentsPort,
    private readonly events: EventEmitter2,
    @Inject(IMAGE_REPOSITORY) private readonly images: ImageRepository,
  ) {}

  async execute(input: {
    conversationId: string; authorId: string; content?: string;
    attachments?: Array<{ documentId: string; versionId?: string }>;
    imageIds?: string[]; replyToId?: string;
  }): Promise<Message> {
    const members = await this.conversations.getMemberIds(input.conversationId);
    if (!members.includes(input.authorId)) throw new ForbiddenError('No perteneces a esta conversación');
    if (input.content !== undefined && typeof input.content !== 'string') throw new ValidationError('El mensaje debe ser texto');
    const imageIds = input.imageIds ?? [];
    if (!Array.isArray(imageIds) || imageIds.some((x) => typeof x !== 'string')) throw new ValidationError('Imágenes inválidas');
    if (!input.content?.trim() && !input.attachments?.length && imageIds.length === 0) throw new ValidationError('Mensaje vacío');
    // El WebSocket no pasa por el ValidationPipe de HTTP: estos topes se aplican aquí para ambos canales.
    if ((input.content?.length ?? 0) > MESSAGE_LIMITS.maxChars) throw new ValidationError(`El mensaje no puede superar ${MESSAGE_LIMITS.maxChars} caracteres`);
    if (input.attachments !== undefined && !Array.isArray(input.attachments)) throw new ValidationError('Adjuntos inválidos');
    if ((input.attachments?.length ?? 0) > MESSAGE_LIMITS.maxAttachments) throw new ValidationError(`Máximo ${MESSAGE_LIMITS.maxAttachments} adjuntos por mensaje`);
    if (new Set(imageIds).size !== imageIds.length) throw new ValidationError('Imágenes repetidas');
    if (imageIds.length > IMAGE_LIMITS.maxPerMessage) throw new ValidationError(`Máximo ${IMAGE_LIMITS.maxPerMessage} imágenes por mensaje`);

    // Responder: el mensaje citado debe existir y ser de ESTA conversación (si no, se podría citar texto de un chat ajeno).
    if (input.replyToId) {
      const quoted = await this.messages.brief(input.replyToId);
      if (!quoted || quoted.conversationId !== input.conversationId) throw new ValidationError('El mensaje al que respondes no existe en esta conversación');
    }

    // Imágenes: solo las que esta persona subió a esta conversación y aún no usó.
    const staged = imageIds.length ? await this.images.findStaged(imageIds, input.conversationId, input.authorId) : [];
    if (staged.length !== imageIds.length) throw new ValidationError('Alguna imagen ya no está disponible; vuelve a subirla');

    // 1. El módulo de archivos valida que el autor pueda adjuntar cada documento.
    const resolved = await Promise.all(
      (input.attachments ?? []).map((a) => this.documents.resolveAttachment({ ...a, userId: input.authorId })),
    );

    // 2. Se guarda el mensaje apuntando a la versión exacta, con un acuse pendiente por destinatario.
    const recipients = members.filter((m) => m !== input.authorId);
    const saved = await this.messages.create({
      conversationId: input.conversationId, authorId: input.authorId, content: input.content,
      attachments: resolved.map(({ documentId, versionId }) => ({ documentId, versionId })),
      imageIds, replyToId: input.replyToId, recipientIds: recipients,
    });

    // 3. Los destinatarios reciben permiso de descarga y queda registro (acción SHARE, canal chat).
    for (const attachment of resolved) {
      await this.documents.shareWithRecipients({
        attachment, senderId: input.authorId, recipientIds: recipients, conversationId: input.conversationId,
      });
    }

    const message: Message = {
      id: saved.id, conversationId: input.conversationId, authorId: input.authorId,
      content: input.content, attachments: resolved, createdAt: saved.createdAt,
      images: staged.map(({ id, fileName, mimeType, sizeBytes, width, height }) => ({ id, fileName, mimeType, sizeBytes, width, height })),
      replyToId: input.replyToId,
    };
    this.events.emit('chat.message.sent', message); // notificaciones y otros módulos escuchan esto
    return message;
  }
}
