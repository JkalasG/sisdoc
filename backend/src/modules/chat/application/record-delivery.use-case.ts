import { Inject, Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { RECEIPT_REPOSITORY, ReceiptRepository } from '../domain/ports';

/** Registra, con fecha y hora, cuándo LLEGÓ un mensaje al dispositivo de cada destinatario. */
@Injectable()
export class RecordDeliveryUseCase {
  constructor(
    @Inject(RECEIPT_REPOSITORY) private readonly receipts: ReceiptRepository,
    private readonly events: EventEmitter2,
  ) {}

  /** Mensaje nuevo: lo reciben las personas conectadas en ese momento. */
  async forMessage(input: { messageId: string; userIds: string[] }): Promise<void> {
    const all = await Promise.all(input.userIds.map((userId) => this.receipts.markDelivered({ userId, messageId: input.messageId })));
    this.publish(all.flat());
  }

  /** Al conectarse: todo lo que le llegó mientras estaba desconectada se entrega ahora. */
  async onConnect(userId: string): Promise<void> {
    this.publish(await this.receipts.markDelivered({ userId }));
  }

  private publish(updates: unknown[]) {
    if (updates.length) this.events.emit('chat.receipts.updated', updates);
  }
}
