import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../shared/infrastructure/prisma/prisma.service';
import {
  ConversationRepository, ConversationSummary, MessageAttachment, MessageRepository, MessageView,
} from '../domain/ports';

@Injectable()
export class PrismaConversationRepository implements ConversationRepository {
  constructor(private readonly prisma: PrismaService) {}

  async getMemberIds(conversationId: string) {
    const rows = await this.prisma.conversationMember.findMany({ where: { conversationId }, select: { userId: true } });
    return rows.map((r) => r.userId);
  }

  async listForUser(userId: string): Promise<ConversationSummary[]> {
    const mine = await this.prisma.conversationMember.findMany({
      where: { userId },
      include: {
        conversation: {
          include: {
            members: true,
            messages: { orderBy: { createdAt: 'desc' }, take: 1, include: { attachments: true } },
          },
        },
      },
    });
    const userIds = [...new Set(mine.flatMap((m) => m.conversation.members.map((x) => x.userId)))];
    const users = await this.prisma.user.findMany({
      where: { id: { in: userIds } }, select: { id: true, displayName: true, email: true },
    });
    const byId = new Map(users.map((u) => [u.id, u]));

    const rows = await Promise.all(mine.map(async (m) => {
      const c = m.conversation;
      const members = c.members.map((x) => byId.get(x.userId)).filter((u) => !!u)
        .map((u) => ({ id: u.id, name: u.displayName, email: u.email }));
      const last = c.messages[0];
      const unread = await this.prisma.message.count({
        where: { conversationId: c.id, authorId: { not: userId }, ...(m.lastReadAt ? { createdAt: { gt: m.lastReadAt } } : {}) },
      });
      const other = members.find((u) => u.id !== userId);
      const summary: ConversationSummary = {
        id: c.id,
        type: c.type as 'DIRECT' | 'GROUP',
        name: c.name ?? (c.type === 'DIRECT' ? other?.name : undefined) ?? 'Conversación',
        members,
        unread,
        lastMessage: last
          ? { text: last.content?.trim() || (last.attachments.length ? 'Documento adjunto' : ''), at: last.createdAt }
          : undefined,
      };
      return summary;
    }));
    return rows.sort((a, b) => (b.lastMessage?.at.getTime() ?? 0) - (a.lastMessage?.at.getTime() ?? 0));
  }

  async markRead(conversationId: string, userId: string) {
    await this.prisma.conversationMember.update({
      where: { conversationId_userId: { conversationId, userId } }, data: { lastReadAt: new Date() },
    });
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

  async authorName(userId: string) {
    const u = await this.prisma.user.findUnique({ where: { id: userId }, select: { displayName: true } });
    return u?.displayName ?? 'Usuario';
  }

  async listByConversation(conversationId: string): Promise<MessageView[]> {
    const rows = await this.prisma.message.findMany({
      where: { conversationId }, orderBy: { createdAt: 'asc' }, include: { attachments: true },
    });
    const versions = await this.prisma.documentVersion.findMany({
      where: { id: { in: rows.flatMap((r) => r.attachments.map((a) => a.versionId)) } },
    });
    const versionById = new Map(versions.map((v) => [v.id, v]));
    const users = await this.prisma.user.findMany({
      where: { id: { in: [...new Set(rows.map((r) => r.authorId))] } }, select: { id: true, displayName: true },
    });
    const nameById = new Map(users.map((u) => [u.id, u.displayName]));

    return rows.map((r) => ({
      id: r.id,
      conversationId: r.conversationId,
      authorId: r.authorId,
      authorName: nameById.get(r.authorId) ?? 'Usuario',
      content: r.content ?? undefined,
      createdAt: r.createdAt,
      attachments: r.attachments.flatMap((a): MessageAttachment[] => {
        const v = versionById.get(a.versionId);
        return v ? [{
          documentId: a.documentId, versionId: a.versionId, versionNumber: v.versionNumber,
          fileName: v.fileName, mimeType: v.mimeType, sizeBytes: Number(v.sizeBytes),
        }] : [];
      }),
    }));
  }
}
