import { EventEmitter2 } from '@nestjs/event-emitter';
import { ForbiddenError, ValidationError } from '../../../shared/domain/domain-error';
import { Contact, ContactsPort, ConversationRepository, ConversationSummary } from '../domain/ports';
import { CreateConversationUseCase, GROUP_LIMITS } from './create-conversation.use-case';
import { CONTACTS_LIMIT, ListContactsUseCase } from './list-contacts.use-case';
import { MarkReadUseCase } from './mark-read.use-case';

const PEOPLE: Record<string, Contact & { active: boolean }> = {
  ana: { id: 'ana', name: 'Ana Quispe', email: 'ana@empresa.com', active: true },
  luis: { id: 'luis', name: 'Luis Rojas', email: 'luis@empresa.com', active: true },
  marta: { id: 'marta', name: 'Marta Rojas', email: 'marta@empresa.com', active: true },
  jorge: { id: 'jorge', name: 'Jorge Vargas', email: 'jorge@empresa.com', active: true },
  inactivo: { id: 'inactivo', name: 'Baja Pérez', email: 'baja@empresa.com', active: false },
};

class FakeContacts implements ContactsPort {
  lastSearch?: Parameters<ContactsPort['search']>[0];
  async search(i: Parameters<ContactsPort['search']>[0]) {
    this.lastSearch = i;
    return Object.values(PEOPLE).filter((p) => p.active && p.id !== i.exceptUserId)
      .filter((p) => !i.q || `${p.name} ${p.email}`.toLowerCase().includes(i.q.toLowerCase())).slice(0, i.limit);
  }
  async activeIds(ids: string[]) { return ids.filter((id) => PEOPLE[id]?.active); }
}

class FakeConversations implements ConversationRepository {
  rows: Array<{ id: string; type: 'DIRECT' | 'GROUP'; name?: string; memberIds: string[]; read: Record<string, boolean> }> = [];
  async getMemberIds(id: string) { return this.rows.find((r) => r.id === id)?.memberIds ?? []; }
  async idsForUser(userId: string) { return this.rows.filter((r) => r.memberIds.includes(userId)).map((r) => r.id); }
  async findDirect(a: string, b: string) {
    return this.rows.find((r) => r.type === 'DIRECT' && r.memberIds.includes(a) && r.memberIds.includes(b))?.id ?? null;
  }
  async create(i: { type: 'DIRECT' | 'GROUP'; name?: string; memberIds: string[] }) {
    const id = `c-${this.rows.length + 1}`;
    this.rows.push({ id, ...i, read: {} });
    return { id, created: true };
  }
  async summaryFor(id: string, userId: string): Promise<ConversationSummary | null> {
    const r = this.rows.find((x) => x.id === id);
    if (!r || !r.memberIds.includes(userId)) return null;
    const other = r.memberIds.find((m) => m !== userId)!;
    return {
      id, type: r.type, name: r.name ?? PEOPLE[other].name, unread: 0,
      members: r.memberIds.map((m) => ({ id: m, name: PEOPLE[m].name, email: PEOPLE[m].email })),
    };
  }
  async listForUser(): Promise<ConversationSummary[]> { return []; }
  async markRead(id: string, userId: string) { this.rows.find((r) => r.id === id)!.read[userId] = true; }
}

function build() {
  const repo = new FakeConversations();
  const contacts = new FakeContacts();
  const events = new EventEmitter2();
  const emitted: unknown[] = [];
  events.on('chat.conversation.created', (e) => emitted.push(e));
  return { repo, contacts, emitted, create: new CreateConversationUseCase(repo, contacts, events) };
}

describe('CreateConversationUseCase: chat directo', () => {
  it('crea el chat con las dos personas y avisa a ambas (evento para el tiempo real)', async () => {
    const { create, repo, emitted } = build();
    const r = await create.execute({ creatorId: 'ana', type: 'DIRECT', memberIds: ['luis'] });
    expect(r.created).toBe(true);
    expect(r.conversation).toMatchObject({ type: 'DIRECT', name: 'Luis Rojas' }); // el nombre es el de la OTRA persona
    expect(repo.rows[0].memberIds).toEqual(['ana', 'luis']);
    expect(emitted).toEqual([{ conversationId: r.conversation.id, memberIds: ['ana', 'luis'] }]);
  });

  it('si ya existe un chat entre ambos, abre ese: no duplica ni vuelve a avisar', async () => {
    const { create, repo, emitted } = build();
    const first = await create.execute({ creatorId: 'ana', type: 'DIRECT', memberIds: ['luis'] });
    const again = await create.execute({ creatorId: 'ana', type: 'DIRECT', memberIds: ['luis'] });
    const reverse = await create.execute({ creatorId: 'luis', type: 'DIRECT', memberIds: ['ana'] });
    expect([again.created, reverse.created]).toEqual([false, false]);
    expect(again.conversation.id).toBe(first.conversation.id);
    expect(reverse.conversation.id).toBe(first.conversation.id);
    expect(repo.rows).toHaveLength(1);
    expect(emitted).toHaveLength(1);
  });

  it('no permite chatear contigo mismo ni con 0 o 2 personas', async () => {
    const { create } = build();
    await expect(create.execute({ creatorId: 'ana', type: 'DIRECT', memberIds: ['ana'] })).rejects.toBeInstanceOf(ValidationError);
    await expect(create.execute({ creatorId: 'ana', type: 'DIRECT', memberIds: [] })).rejects.toBeInstanceOf(ValidationError);
    await expect(create.execute({ creatorId: 'ana', type: 'DIRECT', memberIds: ['luis', 'marta'] })).rejects.toBeInstanceOf(ValidationError);
  });

  it('rechaza a personas inexistentes o dadas de baja con el MISMO error (no sirve para sondear cuentas)', async () => {
    const { create } = build();
    const e1 = await create.execute({ creatorId: 'ana', type: 'DIRECT', memberIds: ['inactivo'] }).catch((e) => e);
    const e2 = await create.execute({ creatorId: 'ana', type: 'DIRECT', memberIds: ['no-existe'] }).catch((e) => e);
    expect(e1).toBeInstanceOf(ValidationError);
    expect(e2.message).toBe(e1.message);
  });
});

describe('CreateConversationUseCase: grupos', () => {
  const grupo = (over: object = {}) => ({ creatorId: 'ana', type: 'GROUP' as const, name: 'Contabilidad', memberIds: ['luis', 'marta'], ...over });

  it('crea el grupo con el creador incluido, sin duplicados y con el nombre normalizado', async () => {
    const { create, repo } = build();
    const r = await create.execute(grupo({ name: '  Equipo   de  Contabilidad ', memberIds: ['luis', 'marta', 'luis', 'ana'] }));
    expect(r.created).toBe(true);
    expect(repo.rows[0]).toMatchObject({ type: 'GROUP', name: 'Equipo de Contabilidad', memberIds: ['ana', 'luis', 'marta'] });
  });

  it('dos grupos con las mismas personas son grupos distintos (a diferencia de los directos)', async () => {
    const { create, repo } = build();
    await create.execute(grupo());
    await create.execute(grupo({ name: 'Otro grupo' }));
    expect(repo.rows).toHaveLength(2);
  });

  it('exige nombre (2–80 caracteres) y al menos 2 personas además del creador', async () => {
    const { create } = build();
    await expect(create.execute(grupo({ name: '' }))).rejects.toBeInstanceOf(ValidationError);
    await expect(create.execute(grupo({ name: 'x' }))).rejects.toBeInstanceOf(ValidationError);
    await expect(create.execute(grupo({ name: 'x'.repeat(GROUP_LIMITS.maxNameChars + 1) }))).rejects.toBeInstanceOf(ValidationError);
    await expect(create.execute(grupo({ name: undefined }))).rejects.toBeInstanceOf(ValidationError);
    await expect(create.execute(grupo({ memberIds: ['luis'] }))).rejects.toBeInstanceOf(ValidationError);
    await expect(create.execute(grupo({ memberIds: ['luis', 'luis', 'ana'] }))).rejects.toBeInstanceOf(ValidationError); // solo cuenta 1 persona distinta
  });

  it('máximo 50 personas en total', async () => {
    const { create } = build();
    const muchos = Array.from({ length: 50 }, (_, i) => `u${i}`);
    muchos.forEach((id) => { PEOPLE[id] = { id, name: id, email: `${id}@e.com`, active: true }; });
    try {
      await expect(create.execute(grupo({ memberIds: muchos }))).rejects.toBeInstanceOf(ValidationError);
      await expect(create.execute(grupo({ memberIds: muchos.slice(0, GROUP_LIMITS.maxOthers) }))).resolves.toBeDefined();
    } finally { muchos.forEach((id) => delete PEOPLE[id]); }
  });

  it('un integrante dado de baja invalida la creación del grupo', async () => {
    const { create, repo } = build();
    await expect(create.execute(grupo({ memberIds: ['luis', 'inactivo'] }))).rejects.toBeInstanceOf(ValidationError);
    expect(repo.rows).toHaveLength(0);
  });
});

describe('ListContactsUseCase', () => {
  it('lista usuarios activos sin incluirte a ti, ni a los dados de baja', async () => {
    const contacts = new FakeContacts();
    const r = await new ListContactsUseCase(contacts).execute({ userId: 'ana' });
    expect(r.map((c) => c.id)).toEqual(['luis', 'marta', 'jorge']);
  });

  it('busca por nombre o correo, sin importar mayúsculas, y recorta la búsqueda', async () => {
    const contacts = new FakeContacts();
    const uc = new ListContactsUseCase(contacts);
    expect((await uc.execute({ userId: 'ana', q: '  ROJAS ' })).map((c) => c.id)).toEqual(['luis', 'marta']);
    expect((await uc.execute({ userId: 'ana', q: 'jorge@' })).map((c) => c.id)).toEqual(['jorge']);
    await uc.execute({ userId: 'ana', q: 'x'.repeat(500) });
    expect(contacts.lastSearch!.q).toHaveLength(100);
    expect(contacts.lastSearch!.limit).toBe(CONTACTS_LIMIT);
    await uc.execute({ userId: 'ana', q: '   ' });
    expect(contacts.lastSearch!.q).toBeUndefined();
  });
});

describe('MarkReadUseCase', () => {
  it('marca como leída solo para un miembro; un ajeno recibe Forbidden', async () => {
    const repo = new FakeConversations();
    const { id } = await repo.create({ type: 'DIRECT', memberIds: ['ana', 'luis'] });
    const receipts = { markDelivered: async () => [], markRead: async () => [] };
    const uc = new MarkReadUseCase(repo, receipts, new EventEmitter2());
    await uc.execute({ conversationId: id, userId: 'ana' });
    expect(repo.rows[0].read).toEqual({ ana: true });
    await expect(uc.execute({ conversationId: id, userId: 'marta' })).rejects.toBeInstanceOf(ForbiddenError);
    await expect(uc.execute({ conversationId: 'no-existe', userId: 'ana' })).rejects.toBeInstanceOf(ForbiddenError);
  });
});
