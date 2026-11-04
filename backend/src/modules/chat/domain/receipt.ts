/**
 * Acuse de cada destinatario de un mensaje, con fecha y hora de cada hito (trazabilidad / auditoría).
 * Los hitos se registran UNA vez y no se sobrescriben: la primera vez que ocurrió es la que vale.
 */
export interface Receipt {
  userId: string;
  userName: string;
  deliveredAt: Date | null;
  readAt: Date | null;
}

export type DeliveryStatus = 'SENT' | 'DELIVERED' | 'READ';

/**
 * Estado que ve quien envió (como en los chats grupales habituales): ENTREGADO cuando LLEGÓ a todos y LEÍDO
 * cuando lo leyeron todos. Mientras falte alguien, se queda en el estado anterior.
 */
export function deliveryStatus(receipts: ReadonlyArray<Pick<Receipt, 'deliveredAt' | 'readAt'>>): DeliveryStatus {
  if (receipts.length === 0) return 'SENT';
  if (receipts.every((r) => r.readAt)) return 'READ';
  if (receipts.every((r) => r.deliveredAt || r.readAt)) return 'DELIVERED';
  return 'SENT';
}

/** Una novedad de acuses, con lo necesario para avisar a quien envió. */
export interface ReceiptUpdate {
  messageId: string;
  conversationId: string;
  authorId: string;
  userId: string;
  userName: string;
  deliveredAt: Date | null;
  readAt: Date | null;
}

/** Los últimos N mensajes propios son los únicos que se pueden editar. */
export const EDIT_POLICY = { lastMessages: 3, maxChars: 4000 } as const;

export function canEditMessage(messageId: string, ownRecentIdsNewestFirst: readonly string[]): boolean {
  return ownRecentIdsNewestFirst.slice(0, EDIT_POLICY.lastMessages).includes(messageId);
}
