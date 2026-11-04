import { MessageView } from '../domain/ports';
import { ReceiptUpdate } from '../domain/receipt';

const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null);

/** Forma JSON del mensaje: fechas en ISO 8601 (UTC) con milisegundos. */
export function messageDto(m: MessageView) {
  const { createdAt, editedAt, receipts, ...rest } = m;
  return {
    ...rest,
    createdAt: createdAt.toISOString(),
    editedAt: iso(editedAt) ?? undefined,
    ...(receipts ? { receipts: receipts.map((r) => ({ ...r, deliveredAt: iso(r.deliveredAt), readAt: iso(r.readAt) })) } : {}),
  };
}

/** Agrupa las novedades de acuses por quien envió los mensajes y por conversación. */
export function groupReceiptUpdates(updates: ReceiptUpdate[]) {
  const groups = new Map<string, { authorId: string; payload: { conversationId: string; userId: string; userName: string; items: Array<{ messageId: string; deliveredAt: string | null; readAt: string | null }> } }>();
  for (const u of updates) {
    const key = `${u.authorId}|${u.conversationId}|${u.userId}`;
    let g = groups.get(key);
    if (!g) {
      g = { authorId: u.authorId, payload: { conversationId: u.conversationId, userId: u.userId, userName: u.userName, items: [] } };
      groups.set(key, g);
    }
    g.payload.items.push({ messageId: u.messageId, deliveredAt: iso(u.deliveredAt), readAt: iso(u.readAt) });
  }
  return [...groups.values()];
}
