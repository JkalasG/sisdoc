import { Module } from '@nestjs/common';
import { JoinConversationUseCase } from './application/join-conversation.use-case';
import { SendMessageUseCase } from './application/send-message.use-case';
import { CONVERSATION_REPOSITORY, DOCUMENTS_PORT, MESSAGE_REPOSITORY } from './domain/ports';
import { FilesDocumentsAdapter } from './infrastructure/files-documents.adapter';
import { PrismaConversationRepository, PrismaMessageRepository } from './infrastructure/prisma-chat.repositories';
import { ChatGateway } from './presentation/chat.gateway';
import { AuthModule } from '../auth/auth.public-api';
import { FilesModule } from '../files/files.public-api';

@Module({
  imports: [FilesModule, AuthModule], // files expone DOCUMENTS_API; auth, la sesión
  providers: [
    SendMessageUseCase, JoinConversationUseCase, ChatGateway,
    { provide: CONVERSATION_REPOSITORY, useClass: PrismaConversationRepository },
    { provide: MESSAGE_REPOSITORY, useClass: PrismaMessageRepository },
    { provide: DOCUMENTS_PORT, useClass: FilesDocumentsAdapter },
  ],
})
export class ChatModule {}
