import { Body, Controller, Get, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsArray, IsOptional, IsString, IsUUID, MaxLength, ValidateNested } from 'class-validator';
import { AuthUser, CurrentUser } from '../../../shared/presentation/current-user.decorator';
import { JwtCookieGuard } from '../../auth/auth.public-api';
import { QueryChatUseCase } from '../application/query-chat.use-case';
import { SendMessageUseCase } from '../application/send-message.use-case';
import { MessageView } from '../domain/ports';

class AttachmentDto {
  @IsUUID() documentId: string;
  @IsOptional() @IsUUID() versionId?: string;
}
class SendMessageDto {
  @IsOptional() @IsString() @MaxLength(4000) content?: string;
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => AttachmentDto) attachments?: AttachmentDto[];
}

const toDto = (m: MessageView) => ({ ...m, createdAt: m.createdAt.toISOString() });

@ApiTags('chat')
@UseGuards(JwtCookieGuard)
@Controller('conversations')
export class ChatController {
  constructor(private readonly query: QueryChatUseCase, private readonly send: SendMessageUseCase) {}

  @Get()
  async list(@CurrentUser() u: AuthUser) {
    const rows = await this.query.conversationsOf(u.id);
    return rows.map((c) => ({ ...c, lastMessage: c.lastMessage && { text: c.lastMessage.text, at: c.lastMessage.at.toISOString() } }));
  }

  @Get(':id/messages')
  async messages(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    const list = await this.query.messagesOf({ conversationId: id, userId: u.id });
    return list.map(toDto);
  }

  @Post(':id/messages')
  async post(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: SendMessageDto) {
    const message = await this.send.execute({ conversationId: id, authorId: u.id, content: dto.content, attachments: dto.attachments });
    return toDto(await this.query.withAuthor(message));
  }
}
