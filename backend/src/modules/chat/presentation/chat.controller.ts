import {
  Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query, Res, StreamableFile, UploadedFile, UseGuards, UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { Readable } from 'stream';
import { ApiTags } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsIn, IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min, ValidateNested } from 'class-validator';
import { AuthUser, CurrentUser } from '../../../shared/presentation/current-user.decorator';
import { JwtCookieGuard } from '../../auth/auth.public-api';
import { GetChatImageUseCase, UploadChatImageUseCase } from '../application/chat-images.use-cases';
import { CreateConversationUseCase } from '../application/create-conversation.use-case';
import { EditMessageUseCase } from '../application/edit-message.use-case';
import { ListContactsUseCase } from '../application/list-contacts.use-case';
import { MarkReadUseCase } from '../application/mark-read.use-case';
import { MessageTraceUseCase } from '../application/message-trace.use-case';
import { QueryChatUseCase } from '../application/query-chat.use-case';
import { SendMessageUseCase } from '../application/send-message.use-case';
import { IMAGE_LIMITS } from '../domain/image';
import { messageDto } from './message.dto';

class AttachmentDto {
  @IsUUID() documentId: string;
  @IsOptional() @IsUUID() versionId?: string;
}
class CreateConversationDto {
  @IsIn(['DIRECT', 'GROUP']) type: 'DIRECT' | 'GROUP';
  @IsArray() @ArrayMaxSize(60) @IsUUID('all', { each: true }) memberIds: string[];
  @IsOptional() @IsString() @MaxLength(80) name?: string;
}
class ContactsQuery {
  @IsOptional() @IsString() @MaxLength(100) q?: string;
}
class MessagesQuery {
  @IsOptional() @IsString() @MaxLength(120) before?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(50) limit?: number;
}
class EditMessageDto {
  @IsString() @MaxLength(4000) content: string;
}
class SendMessageDto {
  @IsOptional() @IsString() @MaxLength(4000) content?: string;
  @IsOptional() @IsUUID() replyToId?: string;
  @IsOptional() @IsArray() @ArrayMaxSize(10) @IsUUID('all', { each: true }) imageIds?: string[];
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => AttachmentDto) attachments?: AttachmentDto[];
}

@ApiTags('chat')
@UseGuards(JwtCookieGuard)
@Controller('conversations')
export class ChatController {
  constructor(
    private readonly query: QueryChatUseCase, private readonly send: SendMessageUseCase,
    private readonly create: CreateConversationUseCase, private readonly contacts: ListContactsUseCase, private readonly markRead: MarkReadUseCase,
    private readonly edit: EditMessageUseCase, private readonly trace: MessageTraceUseCase,
    private readonly uploadImage: UploadChatImageUseCase, private readonly getImage: GetChatImageUseCase,
  ) {}

  @Get()
  async list(@CurrentUser() u: AuthUser) {
    const rows = await this.query.conversationsOf(u.id);
    return rows.map((c) => ({ ...c, lastMessage: c.lastMessage && { text: c.lastMessage.text, at: c.lastMessage.at.toISOString() } }));
  }

  /** Personas con las que se puede iniciar un chat (usuarios activos; nunca uno mismo). */
  @Get('contacts')
  searchContacts(@CurrentUser() u: AuthUser, @Query() q: ContactsQuery) {
    return this.contacts.execute({ userId: u.id, q: q.q });
  }

  /** Chat directo (si ya existe, devuelve ese con `created: false`) o grupo nuevo. */
  @Post()
  async createConversation(@CurrentUser() u: AuthUser, @Body() dto: CreateConversationDto) {
    const r = await this.create.execute({ creatorId: u.id, type: dto.type, memberIds: dto.memberIds, name: dto.name });
    return {
      created: r.created,
      conversation: { ...r.conversation, lastMessage: r.conversation.lastMessage && { text: r.conversation.lastMessage.text, at: r.conversation.lastMessage.at.toISOString() } },
    };
  }

  @Post(':id/read')
  @HttpCode(204)
  async read(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    await this.markRead.execute({ conversationId: id, userId: u.id });
  }

  @Get(':id/messages')
  async messages(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Query() q: MessagesQuery) {
    const page = await this.query.messagesOf({ conversationId: id, userId: u.id, before: q.before, limit: q.limit });
    return { items: page.items.map(messageDto), nextCursor: page.nextCursor };
  }

  @Post(':id/messages')
  async post(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: SendMessageDto) {
    const message = await this.send.execute({
      conversationId: id, authorId: u.id, content: dto.content, attachments: dto.attachments, imageIds: dto.imageIds, replyToId: dto.replyToId,
    });
    return messageDto(await this.query.messageView(message.id, u.id)); // quien envía ve los acuses de sus destinatarios
  }

  /** Edita el texto de uno de TUS últimos 3 mensajes de la conversación. */
  @Patch(':id/messages/:messageId')
  async editMessage(
    @CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Param('messageId', ParseUUIDPipe) messageId: string, @Body() dto: EditMessageDto,
  ) {
    return messageDto(await this.edit.execute({ conversationId: id, messageId, editorId: u.id, content: dto.content }));
  }

  /** Trazabilidad del mensaje: enviado / entregado / leído por destinatario, con fecha y hora, y sus ediciones. Solo para su autor. */
  @Get(':id/messages/:messageId/trace')
  async messageTrace(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Param('messageId', ParseUUIDPipe) messageId: string) {
    const t = await this.trace.execute({ conversationId: id, messageId, userId: u.id });
    const iso = (d: Date | null) => (d ? d.toISOString() : null);
    return {
      messageId: t.messageId, sentAt: t.sentAt.toISOString(), status: t.status,
      receipts: t.receipts.map((r) => ({ ...r, deliveredAt: iso(r.deliveredAt), readAt: iso(r.readAt) })),
      edits: t.edits.map((e) => ({ ...e, at: e.at.toISOString() })),
    };
  }

  /** Sube una imagen (PNG, JPEG, GIF o WebP, hasta 5 MB). Queda en espera hasta que se envía el mensaje que la lleva. */
  @Post(':id/images')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: IMAGE_LIMITS.maxBytes, files: 1, fields: 2 } }))
  uploadChatImage(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @UploadedFile() file?: Express.Multer.File) {
    return this.uploadImage.execute({ conversationId: id, uploaderId: u.id, body: file?.buffer as Buffer, originalName: file?.originalname });
  }

  /** La imagen, solo para miembros de la conversación. Siempre se declara como imagen y sin ejecución de contenido. */
  @Get(':id/images/:imageId')
  async chatImage(
    @CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Param('imageId', ParseUUIDPipe) imageId: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { image, stream } = await this.getImage.execute({ conversationId: id, imageId, userId: u.id });
    res.set({
      'Content-Type': image.mimeType,
      'Content-Length': String(image.sizeBytes),
      'Content-Disposition': `inline; filename*=UTF-8''${encodeURIComponent(image.fileName)}`,
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'; sandbox",
      'Cache-Control': 'private, max-age=31536000, immutable', // el id nunca cambia de contenido
    });
    return new StreamableFile(stream as Readable);
  }
}
