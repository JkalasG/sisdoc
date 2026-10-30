import { EventEmitter2 } from '@nestjs/event-emitter';
import { ForbiddenError, ValidationError } from '../../../shared/domain/domain-error';
import { ConversationRepository, DocumentsPort, MessageAttachment, MessageRepository } from '../domain/ports';
import { JoinConversationUseCase } from './join-conversation.use-case';
import { SendMessageUseCase } from './send-message.use-case';

class FakeConversations implements ConversationRepository {
  constructor(private readonly membersByConv: Record<string, string[]> = {}) {}
  async getMemberIds(conversationId: string): Promise<string[]> {
    return this.membersByConv[conversationId] ?? [];
  }
}

class FakeMessages implements MessageRepository {
  saved: Array<Parameters<MessageRepository['create']>[0]> = [];
  async create(input: Parameters<MessageRepository['create']>[0]) {
    this.saved.push(input);
    return { id: `msg-${this.saved.length}`, createdAt: new Date('2026-03-02T10:00:00Z') };
  }
}

class FakeDocuments implements DocumentsPort {
  shared: Array<Parameters<DocumentsPort['shareWithRecipients']>[0]> = [];
  async resolveAttachment(input: { documentId: string; versionId?: string; userId: string }): Promise<MessageAttachment> {
    return {
      documentId: input.documentId,
      versionId: input.versionId ?? 'v-1',
      fileName: 'contrato.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 1024,
    };
  }
  async shareWithRecipients(input: Parameters<DocumentsPort['shareWithRecipients']>[0]): Promise<void> {
    this.shared.push(input);
  }
}

describe('Casos de uso de Chat (seguridad y aislamiento)', () => {
  it('JoinConversationUseCase permite unirse solo a miembros de la conversación', async () => {
    const join = new JoinConversationUseCase(new FakeConversations({ 'c-1': ['ana', 'luis'] }));
    await expect(join.execute({ conversationId: 'c-1', userId: 'ana' })).resolves.toBeUndefined();
    await expect(join.execute({ conversationId: 'c-1', userId: 'intruso' })).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('SendMessageUseCase rechaza si el autor no pertenece a la conversación o si el mensaje está vacío', async () => {
    const convs = new FakeConversations({ 'c-1': ['ana', 'luis'] });
    const msgs = new FakeMessages();
    const docs = new FakeDocuments();
    const send = new SendMessageUseCase(convs, msgs, docs, new EventEmitter2());

    await expect(send.execute({ conversationId: 'c-1', authorId: 'intruso', content: 'hola' }))
      .rejects.toBeInstanceOf(ForbiddenError);
    await expect(send.execute({ conversationId: 'c-1', authorId: 'ana', content: '   ' }))
      .rejects.toBeInstanceOf(ValidationError);
  });

  it('SendMessageUseCase adjunta documento, guarda versión exacta y comparte con destinatarios', async () => {
    const convs = new FakeConversations({ 'c-1': ['ana', 'luis'] });
    const msgs = new FakeMessages();
    const docs = new FakeDocuments();
    const send = new SendMessageUseCase(convs, msgs, docs, new EventEmitter2());

    const msg = await send.execute({
      conversationId: 'c-1',
      authorId: 'ana',
      content: 'Revisar adjunto',
      attachments: [{ documentId: 'doc-1' }],
    });

    expect(msg.attachments).toHaveLength(1);
    expect(msg.attachments[0].versionId).toBe('v-1');
    expect(docs.shared).toHaveLength(1);
    expect(docs.shared[0].recipientIds).toEqual(['luis']);
  });
});

