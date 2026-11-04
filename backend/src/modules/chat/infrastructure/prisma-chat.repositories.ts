import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../shared/infrastructure/prisma/prisma.service';
import {
  Contact, ContactsPort, ConversationRepository, ConversationSummary,
} from '../domain/ports';
import { MessageCursor } from '../domain/message-cursor';

@Injectable()
export class PrismaConversationRepository implements ConversationRepository {
  constructor(private readonly prisma: PrismaService) {}

  async getMemberIds(conversationId: string) {
    const rows = await this.prisma.conversationMember.findMany({ where: { conversationId }, select: { userId: true } });
    return rows.map((r) => r.userId);
  }

  async idsForUser(userId: string) {
    const rows = await this.prisma.conversationMember.findMany({ where: { userId }, select: { conversationId: true } });
    return rows.map((r) => r.conversationId);
  }

  async findDirect(a: string, b: string) {
    const c = await this.prisma.conversation.findUnique({ where: { directKey: [a, b].sort().join(':') }, select: { id: true } });
    return c?.id ?? null;
  }

  async create(i: { type: 'DIRECT' | 'GROUP'; name?: string; memberIds: string[] }) {
    const directKey = i.type === 'DIRECT' ? [...i.memberIds].sort().join(':') : null;
    try {
      const c = await this.prisma.conversation.create({
        data: {
          type: i.type, name: i.name, directKey,
          // El que crea lo ve como leído; los demás empiezan sin nada leído.
          members: { create: i.memberIds.map((userId, n) => ({ userId, lastReadAt: n === 0 ? new Date() : null })) },
        },
      });
      return { id: c.id, created: true };
    } catch (e) {
      // Dos personas se escribieron a la vez: gana la primera y la segunda abre ese mismo chat.
      if (directKey && e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        const existing = await this.prisma.conversation.findUnique({ where: { directKey }, select: { id: true } });
        if (existing) return { id: existing.id, created: false };
      }
      throw e;
    }
  }

  async summaryFor(conversationId: string, userId: string) {
    return (await this.listForUser(userId)).find((c) => c.id === conversationId) ?? null;
  }

  /**
   * Lista de chats en 4 consultas fijas, sin importar cuántas conversaciones tenga la persona:
   * membresías, miembros+usuarios, último mensaje de cada una y no leídos agrupados.
   */
  async listForUser(userId: string): Promise<ConversationSummary[]> {
    const mine = await this.prisma.conversationMember.findMany({
      where: { userId }, include: { conversation: { include: { members: true } } },
    });
    if (mine.length === 0) return [];
    const ids = mine.map((m) => m.conversationId);
    const userIds = [...new Set(mine.flatMap((m) => m.conversation.members.map((x) => x.userId)))];

    const [users, lastRows, unreadRows] = await Promise.all([
      this.prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, displayName: true, email: true } }),
      // Último mensaje por conversación: DISTINCT ON recorre el índice (conversation_id, created_at, id) sin cargar el historial.
      this.prisma.$queryRaw<Array<{ conversation_id: string; content: string | null; created_at: Date; has_attachments: boolean }>>(Prisma.sql`
        SELECT DISTINCT ON (m.conversation_id) m.conversation_id, m.content, m.created_at,
               EXISTS (SELECT 1 FROM message_attachments a WHERE a.message_id = m.id) AS has_attachments
          FROM messages m
         WHERE m.conversation_id IN (${Prisma.join(ids)})
         ORDER BY m.conversation_id, m.created_at DESC, m.id DESC`),
      // No leídos de todas las conversaciones en una sola pasada.
      this.prisma.$queryRaw<Array<{ conversation_id: string; unread: number }>>(Prisma.sql`
        SELECT m.conversation_id, COUNT(*)::int AS unread
          FROM messages m
          JOIN conversation_members cm ON cm.conversation_id = m.conversation_id AND cm.user_id = ${userId}
         WHERE m.author_id <> ${userId} AND (cm.last_read_at IS NULL OR m.created_at > cm.last_read_at)
         GROUP BY m.conversation_id`),
    ]);
    const byId = new Map(users.map((u) => [u.id, u]));
    const lastBy = new Map(lastRows.map((r) => [r.conversation_id, r]));
    const unreadBy = new Map(unreadRows.map((r) => [r.conversation_id, r.unread]));

    const rows = mine.map((m): ConversationSummary => {
      const c = m.conversation;
      const members = c.members.map((x) => byId.get(x.userId)).filter((u) => !!u)
        .map((u) => ({ id: u.id, name: u.displayName, email: u.email }));
      const last = lastBy.get(c.id);
      const other = members.find((u) => u.id !== userId);
      return {
        id: c.id,
        type: c.type as 'DIRECT' | 'GROUP',
        name: c.name ?? (c.type === 'DIRECT' ? other?.name : undefined) ?? 'Conversación',
        members,
        unread: unreadBy.get(c.id) ?? 0,
        lastMessage: last ? { text: last.content?.trim() || (last.has_attachments ? 'Documento adjunto' : ''), at: last.created_at } : undefined,
      };
    });
    return rows.sort((a, b) => (b.lastMessage?.at.getTime() ?? 0) - (a.lastMessage?.at.getTime() ?? 0));
  }

  async markRead(conversationId: string, userId: string) {
    await this.prisma.conversationMember.update({
      where: { conversationId_userId: { conversationId, userId } }, data: { lastReadAt: new Date() },
    });
  }
}

@Injectable()
export class PrismaContactsDirectory implements ContactsPort {
  constructor(private readonly prisma: PrismaService) {}

  async search(i: { exceptUserId: string; q?: string; limit: number }): Promise<Contact[]> {
    const rows = await this.prisma.user.findMany({
      where: {
        status: 'ACTIVE', id: { not: i.exceptUserId },
        ...(i.q ? { OR: [{ displayName: { contains: i.q, mode: 'insensitive' } }, { email: { contains: i.q, mode: 'insensitive' } }] } : {}),
      },
      orderBy: { displayName: 'asc' }, take: i.limit, select: { id: true, displayName: true, email: true },
    });
    return rows.map((u) => ({ id: u.id, name: u.displayName, email: u.email }));
  }

  async activeIds(ids: string[]) {
    if (!ids.length) return [];
    const rows = await this.prisma.user.findMany({ where: { id: { in: ids }, status: 'ACTIVE' }, select: { id: true } });
    return rows.map((r) => r.id);
  }
}
