import { Inject, Injectable } from '@nestjs/common';
import { ForbiddenError } from '../../../shared/domain/domain-error';
import { CONVERSATION_REPOSITORY, ConversationRepository } from '../domain/ports';

@Injectable()
export class JoinConversationUseCase {
  constructor(
    @Inject(CONVERSATION_REPOSITORY) private readonly conversations: ConversationRepository,
  ) {}

  async execute(input: { conversationId: string; userId: string }): Promise<void> {
    const members = await this.conversations.getMemberIds(input.conversationId);
    if (!members.includes(input.userId)) {
      throw new ForbiddenError('No perteneces a esta conversación');
    }
  }
}

