import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { ForbiddenError, NotFoundError, ValidationError } from '../../../shared/domain/domain-error';
import { IMAGE_LIMITS, safeImageName, sniffImage } from '../domain/image';
import {
  CONVERSATION_REPOSITORY, ConversationRepository, IMAGE_REPOSITORY, IMAGE_STORAGE, ImageRepository, ImageStorage, MessageImage, StagedImage,
} from '../domain/ports';

/** Sube una imagen a una conversación: queda «en espera» hasta que se envía el mensaje que la lleva. */
@Injectable()
export class UploadChatImageUseCase {
  constructor(
    @Inject(CONVERSATION_REPOSITORY) private readonly conversations: ConversationRepository,
    @Inject(IMAGE_REPOSITORY) private readonly images: ImageRepository,
    @Inject(IMAGE_STORAGE) private readonly storage: ImageStorage,
  ) {}

  async execute(input: { conversationId: string; uploaderId: string; body: Buffer; originalName?: string }): Promise<MessageImage> {
    const members = await this.conversations.getMemberIds(input.conversationId);
    if (!members.includes(input.uploaderId)) throw new ForbiddenError('No perteneces a esta conversación');
    if (!input.body?.length) throw new ValidationError('Falta la imagen');
    if (input.body.length > IMAGE_LIMITS.maxBytes) throw new ValidationError(`La imagen no puede superar ${IMAGE_LIMITS.maxBytes / 1024 / 1024} MB`);
    // El tipo se decide por el CONTENIDO, no por lo que diga el cliente.
    const info = sniffImage(input.body);
    if (!info) throw new ValidationError('Solo se aceptan imágenes PNG, JPEG, GIF o WebP válidas');
    if (await this.images.countStaged(input.conversationId, input.uploaderId) >= IMAGE_LIMITS.maxStagedPerConversation) {
      throw new ValidationError('Tienes demasiadas imágenes sin enviar en esta conversación');
    }
    const storageKey = `chat-images/${randomUUID()}`;
    await this.storage.put(storageKey, input.body);
    const saved = await this.images.create({
      conversationId: input.conversationId, uploaderId: input.uploaderId, storageKey,
      fileName: safeImageName(input.originalName, info.mimeType), mimeType: info.mimeType,
      sizeBytes: input.body.length, width: info.width, height: info.height,
    });
    return { id: saved.id, fileName: saved.fileName, mimeType: saved.mimeType, sizeBytes: saved.sizeBytes, width: saved.width, height: saved.height };
  }
}

/** Entrega una imagen solo a quien pertenece a su conversación (la subida aún sin enviar, solo a quien la subió). */
@Injectable()
export class GetChatImageUseCase {
  constructor(
    @Inject(CONVERSATION_REPOSITORY) private readonly conversations: ConversationRepository,
    @Inject(IMAGE_REPOSITORY) private readonly images: ImageRepository,
    @Inject(IMAGE_STORAGE) private readonly storage: ImageStorage,
  ) {}

  async execute(input: { conversationId: string; imageId: string; userId: string }): Promise<{ image: StagedImage; stream: NodeJS.ReadableStream }> {
    const members = await this.conversations.getMemberIds(input.conversationId);
    if (!members.includes(input.userId)) throw new ForbiddenError('No perteneces a esta conversación');
    const image = await this.images.find(input.imageId);
    // Mismo error para «no existe», «es de otra conversación» y «subida ajena sin enviar»: no se revela cuál es.
    if (!image || image.conversationId !== input.conversationId || (!image.messageId && image.uploaderId !== input.userId)) {
      throw new NotFoundError('Imagen');
    }
    return { image, stream: await this.storage.read(image.storageKey) };
  }
}
