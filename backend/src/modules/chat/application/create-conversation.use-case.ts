import { Inject, Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ValidationError } from '../../../shared/domain/domain-error';
import {
  CONTACTS_PORT, ContactsPort, CONVERSATION_REPOSITORY, ConversationRepository, ConversationSummary,
} from '../domain/ports';

export const GROUP_LIMITS = { minNameChars: 2, maxNameChars: 80, minOthers: 2, maxOthers: 49 } as const;

/**
 * Inicia un chat directo (uno solo por pareja: si ya existe, se abre ese) o crea un grupo.
 * El creador siempre es miembro. Todos los participantes deben ser usuarios activos.
 */
@Injectable()
export class CreateConversationUseCase {
  constructor(
    @Inject(CONVERSATION_REPOSITORY) private readonly conversations: ConversationRepository,
    @Inject(CONTACTS_PORT) private readonly contacts: ContactsPort,
    private readonly events: EventEmitter2,
  ) {}

  async execute(input: {
    creatorId: string; type: 'DIRECT' | 'GROUP'; memberIds: string[]; name?: string;
  }): Promise<{ conversation: ConversationSummary; created: boolean }> {
    const others = [...new Set(input.memberIds)].filter((id) => id !== input.creatorId);
    if (input.memberIds.includes(input.creatorId) && input.type === 'DIRECT' && others.length === 0) {
      throw new ValidationError('No puedes iniciar un chat contigo mismo');
    }

    if (input.type === 'DIRECT') {
      if (others.length !== 1) throw new ValidationError('Un chat directo es con una sola persona');
    } else {
      const name = input.name?.trim().replace(/\s+/g, ' ') ?? '';
      if (name.length < GROUP_LIMITS.minNameChars || name.length > GROUP_LIMITS.maxNameChars) {
        throw new ValidationError(`El nombre del grupo debe tener entre ${GROUP_LIMITS.minNameChars} y ${GROUP_LIMITS.maxNameChars} caracteres`);
      }
      if (others.length < GROUP_LIMITS.minOthers) throw new ValidationError(`Un grupo necesita al menos ${GROUP_LIMITS.minOthers} personas además de ti`);
      if (others.length > GROUP_LIMITS.maxOthers) throw new ValidationError(`Un grupo admite como máximo ${GROUP_LIMITS.maxOthers + 1} personas`);
    }

    // Mismo mensaje exista o no la persona, esté activa o no: no se usa para sondear cuentas.
    const active = new Set(await this.contacts.activeIds(others));
    if (others.some((id) => !active.has(id))) throw new ValidationError('Alguna de las personas elegidas no está disponible');

    if (input.type === 'DIRECT') {
      const existing = await this.conversations.findDirect(input.creatorId, others[0]);
      if (existing) return { conversation: await this.summary(existing, input.creatorId), created: false };
    }

    const memberIds = [input.creatorId, ...others];
    const { id, created } = await this.conversations.create({
      type: input.type, name: input.type === 'GROUP' ? input.name!.trim().replace(/\s+/g, ' ') : undefined, memberIds,
    });
    if (created) this.events.emit('chat.conversation.created', { conversationId: id, memberIds });
    return { conversation: await this.summary(id, input.creatorId), created };
  }

  private async summary(id: string, userId: string) {
    const s = await this.conversations.summaryFor(id, userId);
    if (!s) throw new ValidationError('No se pudo abrir la conversación');
    return s;
  }
}
