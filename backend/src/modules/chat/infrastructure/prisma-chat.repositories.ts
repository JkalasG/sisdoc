import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../shared/infrastructure/prisma/prisma.service';
import { ConversationRepository, MessageRepository } from '../domain/ports';

@Injectable()
export class PrismaConversationRepository implements ConversationRepository {
  constructor(private readonly prisma: PrismaService) {}

  async getMemberIds(conversationId: string) {
    const rows = await this.prisma.conversationMember.findMany({ where: { conversationId }, select: { userId: true } });
    return rows.map((r) => r.userId);
  }
}

@Injectable()
export class PrismaMessageRepository implements MessageRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(i: Parameters<MessageRepository['create']>[0]) {
    const m = await this.prisma.message.create({
      data: {
        conversationId: i.conversationId, authorId: i.authorId, content: i.content,
        attachments: { create: i.attachments },
      },
    });
    return { id: m.id, createdAt: m.createdAt };
  }
}
