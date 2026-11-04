import type { MessageDTO } from '@/shared/api/types';

export type Delivery = 'sent' | 'delivered' | 'read';

/**
 * Lo que ve quien envía: ENTREGADO cuando llegó a todos y LEÍDO cuando lo leyeron todos.
 * Mientras falte el acuse de alguien (aún no hay fila o no tiene fecha), se queda en el estado anterior.
 */
export function deliveryOf(m: Pick<MessageDTO, 'receipts'>, recipients: number): Delivery {
  const r = m.receipts ?? [];
  if (recipients <= 0 || r.length < recipients) return 'sent';
  if (r.every((x) => x.readAt)) return 'read';
  if (r.every((x) => x.deliveredAt || x.readAt)) return 'delivered';
  return 'sent';
}

/** Los últimos N mensajes propios son los únicos editables (misma regla que el servidor). */
export const EDITABLE_LAST = 3;
export function editableIds(messages: Array<Pick<MessageDTO, 'id' | 'authorId'>>, meId: string): Set<string> {
  const mine = messages.filter((m) => m.authorId === meId).slice(-EDITABLE_LAST);
  return new Set(mine.map((m) => m.id));
}
