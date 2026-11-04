import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ValidationError } from '../../../shared/domain/domain-error';
import { PrismaService } from '../../../shared/infrastructure/prisma/prisma.service';
import { MessageCursor } from '../domain/message-cursor';
import {
  ImageRepository, MessageAttachment, MessageImage, MessageQuote, MessageRepository, MessageView, ReceiptRepository, StagedImage,
} from '../domain/ports';
import { Receipt, ReceiptUpdate } from '../domain/receipt';

const QUOTE_CHARS = 140;
const snippet = (t: string) => (t.length > QUOTE_CHARS ? `${t.slice(0, QUOTE_CHARS - 1)}…` : t);

type Row = Prisma.MessageGetPayload<{ include: { attachments: true; images: true } }>;

@Injectable()
export class PrismaMessageRepository implements MessageRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(i: Parameters<MessageRepository['create']>[0]) {
    return this.prisma.$transaction(async (tx) => {
      const m = await tx.message.create({
        data: {
          conversationId: i.conversationId, authorId: i.authorId, content: i.content, replyToId: i.replyToId,
          attachments: { create: i.attachments },
          // Un acuse pendiente por destinatario: de aquí salen «entregado» y «leído» con su fecha y hora.
          receipts: { create: i.recipientIds.map((userId) => ({ userId })) },
        },
      });
      if (i.imageIds.length) {
        // Solo las imágenes que esta persona subió a ESTA conversación y que nadie usó; si alguna falla, nada se guarda.
        const linked = await tx.messageImage.updateMany({
          where: { id: { in: i.imageIds }, uploaderId: i.authorId, conversationId: i.conversationId, messageId: null },
          data: { messageId: m.id },
        });
        if (linked.count !== i.imageIds.length) throw new ValidationError('Alguna imagen ya no está disponible; vuelve a subirla');
      }
      return { id: m.id, createdAt: m.createdAt };
    });
  }

  async listPage({ conversationId, before, limit, viewerId }: { conversationId: string; before?: MessageCursor; limit: number; viewerId?: string }) {
    // Keyset: (created_at, id) < cursor, usando el índice (conversation_id, created_at, id). Se pide uno de más para saber si quedan.
    const found = await this.prisma.message.findMany({
      where: {
        conversationId,
        ...(before ? { OR: [{ createdAt: { lt: before.at } }, { createdAt: before.at, id: { lt: before.id } }] } : {}),
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      include: { attachments: true, images: true },
    });
    const hasMore = found.length > limit;
    const rows = found.slice(0, limit).reverse(); // cronológico ascendente dentro de la página
    return { items: await this.hydrate(rows, viewerId), hasMore };
  }

  async view(messageId: string, viewerId?: string) {
    const row = await this.prisma.message.findUnique({ where: { id: messageId }, include: { attachments: true, images: true } });
    return row ? (await this.hydrate([row], viewerId))[0] : null;
  }

  async brief(messageId: string) {
    const m = await this.prisma.message.findUnique({
      where: { id: messageId },
      select: { id: true, conversationId: true, authorId: true, content: true, _count: { select: { attachments: true, images: true } } },
    });
    return m && {
      id: m.id, conversationId: m.conversationId, authorId: m.authorId, content: m.content ?? undefined,
      hasMedia: m._count.attachments + m._count.images > 0,
    };
  }

  async recentIdsByAuthor(conversationId: string, authorId: string, limit: number) {
    const rows = await this.prisma.message.findMany({
      where: { conversationId, authorId }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: limit, select: { id: true },
    });
    return rows.map((r) => r.id);
  }

  async applyEdit(i: { messageId: string; editorId: string; previousContent?: string; content: string }) {
    const at = new Date();
    await this.prisma.$transaction([
      this.prisma.messageEdit.create({ data: { messageId: i.messageId, editorId: i.editorId, previousContent: i.previousContent ?? null, editedAt: at } }),
      this.prisma.message.update({ where: { id: i.messageId }, data: { content: i.content || null, editedAt: at } }),
    ]);
    return { editedAt: at };
  }

  async trace(messageId: string) {
    const [receipts, edits] = await Promise.all([
      this.prisma.messageReceipt.findMany({ where: { messageId } }),
      this.prisma.messageEdit.findMany({ where: { messageId }, orderBy: { editedAt: 'asc' } }),
    ]);
    const names = await this.names(receipts.map((r) => r.userId));
    return {
      receipts: receipts.map((r): Receipt => ({ userId: r.userId, userName: names.get(r.userId) ?? 'Usuario', deliveredAt: r.deliveredAt, readAt: r.readAt }))
        .sort((a, b) => a.userName.localeCompare(b.userName)),
      edits: edits.map((e) => ({ at: e.editedAt, editorId: e.editorId, previousContent: e.previousContent ?? undefined })),
    };
  }

  async authorName(userId: string) {
    const u = await this.prisma.user.findUnique({ where: { id: userId }, select: { displayName: true } });
    return u?.displayName ?? 'Usuario';
  }

  private async names(ids: string[]) {
    const users = await this.prisma.user.findMany({ where: { id: { in: [...new Set(ids)] } }, select: { id: true, displayName: true } });
    return new Map(users.map((u) => [u.id, u.displayName]));
  }

  /** Completa los mensajes con autor, documentos, imágenes, la cita de la respuesta y (solo al autor) los acuses. */
  private async hydrate(rows: Row[], viewerId?: string): Promise<MessageView[]> {
    if (rows.length === 0) return [];
    const replyIds = [...new Set(rows.map((r) => r.replyToId).filter((x): x is string => !!x))];
    const own = viewerId ? rows.filter((r) => r.authorId === viewerId).map((r) => r.id) : [];
    const [versions, quoted, receipts] = await Promise.all([
      this.prisma.documentVersion.findMany({ where: { id: { in: rows.flatMap((r) => r.attachments.map((a) => a.versionId)) } } }),
      replyIds.length
        ? this.prisma.message.findMany({ where: { id: { in: replyIds } }, include: { attachments: { select: { id: true } }, images: { select: { id: true } } } })
        : Promise.resolve([]),
      own.length ? this.prisma.messageReceipt.findMany({ where: { messageId: { in: own } } }) : Promise.resolve([]),
    ]);
    const names = await this.names([...rows.map((r) => r.authorId), ...quoted.map((q) => q.authorId), ...receipts.map((r) => r.userId)]);
    const versionById = new Map(versions.map((v) => [v.id, v]));
    const quoteById = new Map(quoted.map((q): [string, MessageQuote] => [q.id, {
      id: q.id, authorId: q.authorId, authorName: names.get(q.authorId) ?? 'Usuario',
      text: snippet(q.content?.trim() || (q.images.length ? 'Foto' : 'Documento')),
      kind: q.images.length ? 'IMAGE' : q.attachments.length ? 'DOCUMENT' : 'TEXT',
    }]));
    const receiptsBy = new Map<string, Receipt[]>();
    for (const r of receipts) {
      const list = receiptsBy.get(r.messageId) ?? [];
      list.push({ userId: r.userId, userName: names.get(r.userId) ?? 'Usuario', deliveredAt: r.deliveredAt, readAt: r.readAt });
      receiptsBy.set(r.messageId, list);
    }

    return rows.map((r): MessageView => ({
      id: r.id,
      conversationId: r.conversationId,
      authorId: r.authorId,
      authorName: names.get(r.authorId) ?? 'Usuario',
      content: r.content ?? undefined,
      createdAt: r.createdAt,
      editedAt: r.editedAt ?? undefined,
      replyToId: r.replyToId ?? undefined,
      replyTo: r.replyToId ? quoteById.get(r.replyToId) : undefined,
      images: r.images.map((im): MessageImage => ({ id: im.id, fileName: im.fileName, mimeType: im.mimeType, sizeBytes: im.sizeBytes, width: im.width, height: im.height })),
      attachments: r.attachments.flatMap((a): MessageAttachment[] => {
        const v = versionById.get(a.versionId);
        return v ? [{
          documentId: a.documentId, versionId: a.versionId, versionNumber: v.versionNumber,
          fileName: v.fileName, mimeType: v.mimeType, sizeBytes: Number(v.sizeBytes),
        }] : [];
      }),
      ...(viewerId && r.authorId === viewerId
        ? { receipts: (receiptsBy.get(r.id) ?? []).sort((a, b) => a.userName.localeCompare(b.userName)) }
        : {}),
    }));
  }
}

@Injectable()
export class PrismaReceiptRepository implements ReceiptRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** Los hitos se fijan con `IS NULL` en el WHERE: la primera vez queda escrita y nada la pisa después. */
  markDelivered(i: { userId: string; messageId?: string; conversationId?: string }) {
    const scope = i.messageId ? Prisma.sql`AND m.id = ${i.messageId}` : i.conversationId ? Prisma.sql`AND m.conversation_id = ${i.conversationId}` : Prisma.empty;
    return this.run(i.userId, Prisma.sql`
      UPDATE message_receipts r SET delivered_at = now()
        FROM messages m
       WHERE r.message_id = m.id AND r.user_id = ${i.userId} AND r.delivered_at IS NULL ${scope}
      RETURNING r.message_id, m.conversation_id, m.author_id, r.delivered_at, r.read_at`);
  }

  markRead(i: { conversationId: string; userId: string }) {
    return this.run(i.userId, Prisma.sql`
      UPDATE message_receipts r SET read_at = now(), delivered_at = COALESCE(r.delivered_at, now())
        FROM messages m
       WHERE r.message_id = m.id AND m.conversation_id = ${i.conversationId} AND r.user_id = ${i.userId} AND r.read_at IS NULL
      RETURNING r.message_id, m.conversation_id, m.author_id, r.delivered_at, r.read_at`);
  }

  private async run(userId: string, query: Prisma.Sql): Promise<ReceiptUpdate[]> {
    const rows = await this.prisma.$queryRaw<Array<{ message_id: string; conversation_id: string; author_id: string; delivered_at: Date | null; read_at: Date | null }>>(query);
    if (rows.length === 0) return [];
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { displayName: true } });
    return rows.map((r) => ({
      messageId: r.message_id, conversationId: r.conversation_id, authorId: r.author_id, userId,
      userName: user?.displayName ?? 'Usuario', deliveredAt: r.delivered_at, readAt: r.read_at,
    }));
  }
}

@Injectable()
export class PrismaImageRepository implements ImageRepository {
  constructor(private readonly prisma: PrismaService) {}

  private map(r: Prisma.MessageImageGetPayload<object>): StagedImage {
    return {
      id: r.id, fileName: r.fileName, mimeType: r.mimeType, sizeBytes: r.sizeBytes, width: r.width, height: r.height,
      conversationId: r.conversationId, uploaderId: r.uploaderId, storageKey: r.storageKey, messageId: r.messageId ?? undefined,
    };
  }

  async create(i: Omit<StagedImage, 'id' | 'messageId'>) {
    return this.map(await this.prisma.messageImage.create({ data: i }));
  }

  async find(id: string) {
    const r = await this.prisma.messageImage.findUnique({ where: { id } });
    return r ? this.map(r) : null;
  }

  countStaged(conversationId: string, uploaderId: string) {
    return this.prisma.messageImage.count({ where: { conversationId, uploaderId, messageId: null } });
  }

  async findStaged(ids: string[], conversationId: string, uploaderId: string) {
    const rows = await this.prisma.messageImage.findMany({ where: { id: { in: ids }, conversationId, uploaderId, messageId: null } });
    return rows.map((r) => this.map(r));
  }
}
