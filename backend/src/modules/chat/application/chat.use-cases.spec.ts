import { EventEmitter2 } from '@nestjs/event-emitter';
import { ForbiddenError, ValidationError } from '../../../shared/domain/domain-error';
import { ConversationRepository, DocumentsPort, ImageRepository, MessageAttachment, MessageRepository } from '../domain/ports';
import { JoinConversationUseCase } from './join-conversation.use-case';
import { SendMessageUseCase } from './send-message.use-case';

class FakeConversations implements ConversationRepository {
  constructor(private readonly membersByConv: Record<string, string[]> = {}) {}
  async getMemberIds(conversationId: string): Promise<string[]> {
    return this.membersByConv[conversationId] ?? [];
  }
  async listForUser(): Promise<never[]> { return []; }
  async markRead(): Promise<void> { /* no interviene en estas pruebas */ }
  async idsForUser(): Promise<string[]> { return []; }
  async findDirect(): Promise<string | null> { return null; }
  async create(): Promise<{ id: string; created: boolean }> { throw new Error('no interviene en estas pruebas'); }
  async summaryFor(): Promise<null> { return null; }
}

class FakeMessages implements MessageRepository {
  saved: Array<Parameters<MessageRepository['create']>[0]> = [];
  async create(input: Parameters<MessageRepository['create']>[0]) {
    this.saved.push(input);
    return { id: `msg-${this.saved.length}`, createdAt: new Date('2026-03-02T10:00:00Z') };
  }
  async listPage(): Promise<{ items: never[]; hasMore: boolean }> { return { items: [], hasMore: false }; }
  async view(): Promise<null> { return null; }
  async brief(): Promise<null> { return null; }
  async recentIdsByAuthor(): Promise<string[]> { return []; }
  async applyEdit(): Promise<{ editedAt: Date }> { return { editedAt: new Date() }; }
  async trace(): Promise<{ receipts: never[]; edits: never[] }> { return { receipts: [], edits: [] }; }
  async authorName(): Promise<string> { return 'Autor'; }
}

const noImages: ImageRepository = {
  create: async () => { throw new Error('no interviene'); },
  find: async () => null,
  countStaged: async () => 0,
  findStaged: async () => [],
};

class FakeDocuments implements DocumentsPort {
  shared: Array<Parameters<DocumentsPort['shareWithRecipients']>[0]> = [];
  async resolveAttachment(input: { documentId: string; versionId?: string; userId: string }): Promise<MessageAttachment> {
    return {
      documentId: input.documentId,
      versionId: input.versionId ?? 'v-1',
      versionNumber: 1,
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
    const send = new SendMessageUseCase(convs, msgs, docs, new EventEmitter2(), noImages);

    await expect(send.execute({ conversationId: 'c-1', authorId: 'intruso', content: 'hola' }))
      .rejects.toBeInstanceOf(ForbiddenError);
    await expect(send.execute({ conversationId: 'c-1', authorId: 'ana', content: '   ' }))
      .rejects.toBeInstanceOf(ValidationError);
  });

  it('SendMessageUseCase limita el tamaño del mensaje y de los adjuntos (también para el WebSocket)', async () => {
    const send = new SendMessageUseCase(new FakeConversations({ 'c-1': ['ana', 'luis'] }), new FakeMessages(), new FakeDocuments(), new EventEmitter2(), noImages);
    const base = { conversationId: 'c-1', authorId: 'ana' };
    await expect(send.execute({ ...base, content: 'x'.repeat(4000) })).resolves.toBeDefined();
    await expect(send.execute({ ...base, content: 'x'.repeat(4001) })).rejects.toBeInstanceOf(ValidationError);
    await expect(send.execute({ ...base, content: { $gt: '' } as never })).rejects.toBeInstanceOf(ValidationError);
    const docs = Array.from({ length: 11 }, (_, i) => ({ documentId: `d-${i}` }));
    await expect(send.execute({ ...base, attachments: docs })).rejects.toBeInstanceOf(ValidationError);
    await expect(send.execute({ ...base, attachments: 'no-es-lista' as never })).rejects.toBeInstanceOf(ValidationError);
    await expect(send.execute({ ...base, attachments: docs.slice(0, 10) })).resolves.toBeDefined();
  });

  it('SendMessageUseCase adjunta documento, guarda versión exacta y comparte con destinatarios', async () => {
    const convs = new FakeConversations({ 'c-1': ['ana', 'luis'] });
    const msgs = new FakeMessages();
    const docs = new FakeDocuments();
    const send = new SendMessageUseCase(convs, msgs, docs, new EventEmitter2(), noImages);

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

