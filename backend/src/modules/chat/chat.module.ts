import { Module } from '@nestjs/common';
import { GetChatImageUseCase, UploadChatImageUseCase } from './application/chat-images.use-cases';
import { CreateConversationUseCase } from './application/create-conversation.use-case';
import { EditMessageUseCase } from './application/edit-message.use-case';
import { JoinConversationUseCase } from './application/join-conversation.use-case';
import { ListContactsUseCase } from './application/list-contacts.use-case';
import { MarkReadUseCase } from './application/mark-read.use-case';
import { MessageTraceUseCase } from './application/message-trace.use-case';
import { QueryChatUseCase } from './application/query-chat.use-case';
import { RecordDeliveryUseCase } from './application/record-delivery.use-case';
import { SendMessageUseCase } from './application/send-message.use-case';
import {
  CONTACTS_PORT, CONVERSATION_REPOSITORY, DOCUMENTS_PORT, IMAGE_REPOSITORY, IMAGE_STORAGE, MESSAGE_REPOSITORY, RECEIPT_REPOSITORY,
} from './domain/ports';
import { FilesDocumentsAdapter } from './infrastructure/files-documents.adapter';
import { LocalImageStorage } from './infrastructure/local-image-storage';
import { PrismaContactsDirectory, PrismaConversationRepository } from './infrastructure/prisma-chat.repositories';
import { PrismaImageRepository, PrismaMessageRepository, PrismaReceiptRepository } from './infrastructure/prisma-message.repositories';
import { ChatController } from './presentation/chat.controller';
import { ChatGateway } from './presentation/chat.gateway';
import { AuthModule } from '../auth/auth.public-api';
import { FilesModule } from '../files/files.public-api';

@Module({
  imports: [FilesModule, AuthModule], // files expone DOCUMENTS_API; auth, la sesión
  controllers: [ChatController],
  providers: [
    SendMessageUseCase, JoinConversationUseCase, QueryChatUseCase, CreateConversationUseCase, ListContactsUseCase, MarkReadUseCase,
    EditMessageUseCase, MessageTraceUseCase, RecordDeliveryUseCase, UploadChatImageUseCase, GetChatImageUseCase, ChatGateway,
    { provide: CONVERSATION_REPOSITORY, useClass: PrismaConversationRepository },
    { provide: MESSAGE_REPOSITORY, useClass: PrismaMessageRepository },
    { provide: RECEIPT_REPOSITORY, useClass: PrismaReceiptRepository },
    { provide: IMAGE_REPOSITORY, useClass: PrismaImageRepository },
    { provide: IMAGE_STORAGE, useClass: LocalImageStorage },
    { provide: CONTACTS_PORT, useClass: PrismaContactsDirectory },
    { provide: DOCUMENTS_PORT, useClass: FilesDocumentsAdapter },
  ],
})
export class ChatModule {}
