import { EventEmitter2 } from '@nestjs/event-emitter';
import { ForbiddenError, NotFoundError, ValidationError } from '../../../shared/domain/domain-error';
import {
  ConversationRepository, DocumentsPort, ImageRepository, ImageStorage, MessageRepository, MessageView, ReceiptRepository, StagedImage,
} from '../domain/ports';
import { Receipt, ReceiptUpdate } from '../domain/receipt';
import { GetChatImageUseCase, UploadChatImageUseCase } from './chat-images.use-cases';
import { EditMessageUseCase } from './edit-message.use-case';
import { MarkReadUseCase } from './mark-read.use-case';
import { MessageTraceUseCase } from './message-trace.use-case';
import { RecordDeliveryUseCase } from './record-delivery.use-case';
import { SendMessageUseCase } from './send-message.use-case';

// ---- Simulacros en memoria de los puertos (la lógica se prueba sin base de datos).
const T0 = Date.parse('2026-03-02T10:00:00.000Z');
const at = (s: number) => new Date(T0 + s * 1000);

class Convs implements Partial<ConversationRepository> {
  constructor(private readonly members: Record<string, string[]>) {}
  async getMemberIds(id: string) { return this.members[id] ?? []; }
  async markRead() { /* sin efecto */ }
}

interface Row { id: string; conversationId: string; authorId: string; content?: string; hasMedia: boolean; replyToId?: string; createdAt: Date; edits: Array<{ at: Date; editorId: string; previousContent?: string }>; receipts: Receipt[] }
class Msgs implements Partial<MessageRepository> {
  rows: Row[] = [];
  seq = 0;
  async create(i: Parameters<MessageRepository['create']>[0]) {
    const row: Row = {
      id: `m${++this.seq}`, conversationId: i.conversationId, authorId: i.authorId, content: i.content, replyToId: i.replyToId,
      hasMedia: i.attachments.length + i.imageIds.length > 0, createdAt: at(this.seq), edits: [],
      receipts: i.recipientIds.map((userId) => ({ userId, userName: userId, deliveredAt: null, readAt: null })),
    };
    this.rows.push(row);
    return { id: row.id, createdAt: row.createdAt };
  }
  async brief(id: string) { const r = this.rows.find((x) => x.id === id); return r ? { id: r.id, conversationId: r.conversationId, authorId: r.authorId, content: r.content, hasMedia: r.hasMedia } : null; }
  async recentIdsByAuthor(c: string, a: string, n: number) { return this.rows.filter((r) => r.conversationId === c && r.authorId === a).map((r) => r.id).reverse().slice(0, n); }
  async applyEdit(i: Parameters<MessageRepository['applyEdit']>[0]) {
    const r = this.rows.find((x) => x.id === i.messageId)!;
    r.edits.push({ at: at(100 + r.edits.length), editorId: i.editorId, previousContent: i.previousContent });
    r.content = i.content || undefined;
    return { editedAt: r.edits.at(-1)!.at };
  }
  async view(id: string, viewerId?: string): Promise<MessageView | null> {
    const r = this.rows.find((x) => x.id === id);
    if (!r) return null;
    return {
      id: r.id, conversationId: r.conversationId, authorId: r.authorId, authorName: r.authorId, content: r.content, attachments: [], images: [],
      createdAt: r.createdAt, ...(viewerId === r.authorId ? { receipts: r.receipts } : {}),
    };
  }
  async trace(id: string) { const r = this.rows.find((x) => x.id === id)!; return { receipts: r.receipts, edits: r.edits }; }
}

class Images implements Partial<ImageRepository> {
  rows: StagedImage[] = [];
  async create(i: Omit<StagedImage, 'id' | 'messageId'>) { const r = { ...i, id: `img${this.rows.length + 1}` }; this.rows.push(r); return r; }
  async find(id: string) { return this.rows.find((r) => r.id === id) ?? null; }
  async countStaged(c: string, u: string) { return this.rows.filter((r) => r.conversationId === c && r.uploaderId === u && !r.messageId).length; }
  async findStaged(ids: string[], c: string, u: string) { return this.rows.filter((r) => ids.includes(r.id) && r.conversationId === c && r.uploaderId === u && !r.messageId); }
}
class Storage implements ImageStorage {
  files = new Map<string, Buffer>();
  async put(k: string, b: Buffer) { this.files.set(k, b); }
  async read(k: string) { const { Readable } = await import('stream'); return Readable.from(this.files.get(k) ?? Buffer.alloc(0)); }
}
const docs = { resolveAttachment: async () => { throw new Error('no interviene'); }, shareWithRecipients: async () => undefined } as unknown as DocumentsPort;

const PNG = (() => {
  const b = Buffer.alloc(33);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(b, 0);
  b.writeUInt32BE(13, 8); b.write('IHDR', 12, 'latin1'); b.writeUInt32BE(40, 16); b.writeUInt32BE(30, 20);
  return b;
})();

function setup() {
  const convs = new Convs({ c1: ['ana', 'luis', 'marta'], c2: ['luis', 'pablo'] });
  const msgs = new Msgs(); const images = new Images(); const storage = new Storage(); const events = new EventEmitter2();
  const emitted: Array<{ name: string; payload: unknown }> = [];
  events.onAny((name, payload) => emitted.push({ name: String(name), payload }));
  const send = new SendMessageUseCase(convs as never, msgs as never, docs, events, images as never);
  const edit = new EditMessageUseCase(convs as never, msgs as never, events);
  return { convs, msgs, images, storage, events, emitted, send, edit };
}

describe('Responder a un mensaje', () => {
  it('guarda la referencia al mensaje citado de la MISMA conversación', async () => {
    const { send } = setup();
    const original = await send.execute({ conversationId: 'c1', authorId: 'ana', content: 'Pregunta' });
    const reply = await send.execute({ conversationId: 'c1', authorId: 'luis', content: 'Respuesta', replyToId: original.id });
    expect(reply.replyToId).toBe(original.id);
  });

  it('rechaza citar un mensaje que no existe o que es de OTRA conversación (no se filtra texto ajeno)', async () => {
    const { send } = setup();
    const ajeno = await send.execute({ conversationId: 'c2', authorId: 'pablo', content: 'Secreto de otro chat' });
    await expect(send.execute({ conversationId: 'c1', authorId: 'ana', content: 'x', replyToId: ajeno.id })).rejects.toBeInstanceOf(ValidationError);
    await expect(send.execute({ conversationId: 'c1', authorId: 'ana', content: 'x', replyToId: 'no-existe' })).rejects.toBeInstanceOf(ValidationError);
  });
});

describe('Cada mensaje nace con un acuse pendiente por destinatario', () => {
  it('uno por cada miembro menos el autor, sin entrega ni lectura todavía', async () => {
    const { send, msgs } = setup();
    await send.execute({ conversationId: 'c1', authorId: 'ana', content: 'Hola' });
    expect(msgs.rows[0].receipts.map((r) => r.userId)).toEqual(['luis', 'marta']);
    expect(msgs.rows[0].receipts.every((r) => r.deliveredAt === null && r.readAt === null)).toBe(true);
  });
});

describe('Editar: solo los últimos 3 mensajes propios', () => {
  async function conCincoMensajes() {
    const s = setup();
    const ids: string[] = [];
    for (let i = 1; i <= 5; i++) ids.push((await s.send.execute({ conversationId: 'c1', authorId: 'ana', content: `mensaje ${i}` })).id);
    return { ...s, ids };
  }

  it('permite editar los 3 más recientes, guarda el texto anterior y avisa a la sala', async () => {
    const { edit, msgs, ids, emitted } = await conCincoMensajes();
    const out = await edit.execute({ conversationId: 'c1', messageId: ids[4], editorId: 'ana', content: '  mensaje 5 corregido  ' });
    expect(out.content).toBe('mensaje 5 corregido');
    expect(msgs.rows[4].edits).toEqual([{ at: at(100), editorId: 'ana', previousContent: 'mensaje 5' }]);
    expect(emitted.some((e) => e.name === 'chat.message.edited')).toBe(true);
    await expect(edit.execute({ conversationId: 'c1', messageId: ids[2], editorId: 'ana', content: 'tercero desde el final' })).resolves.toBeDefined();
  });

  it('el cuarto y el quinto más viejos ya NO se pueden editar', async () => {
    const { edit, ids } = await conCincoMensajes();
    for (const id of [ids[1], ids[0]]) {
      await expect(edit.execute({ conversationId: 'c1', messageId: id, editorId: 'ana', content: 'tarde' })).rejects.toThrow(/últimos 3/);
    }
  });

  it('un mensaje nuevo desplaza la ventana: el que era el 3.º pasa a ser el 4.º y se bloquea', async () => {
    const { edit, send, ids } = await conCincoMensajes();
    await expect(edit.execute({ conversationId: 'c1', messageId: ids[2], editorId: 'ana', content: 'aún puedo' })).resolves.toBeDefined();
    await send.execute({ conversationId: 'c1', authorId: 'ana', content: 'mensaje 6' });
    await expect(edit.execute({ conversationId: 'c1', messageId: ids[2], editorId: 'ana', content: 'ya no' })).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('los mensajes de otras personas no cuentan para la ventana ni se pueden editar', async () => {
    const { edit, send, ids } = await conCincoMensajes();
    for (let i = 0; i < 4; i++) await send.execute({ conversationId: 'c1', authorId: 'luis', content: `de Luis ${i}` });
    await expect(edit.execute({ conversationId: 'c1', messageId: ids[4], editorId: 'ana', content: 'sigo pudiendo' })).resolves.toBeDefined(); // sus 3 últimos propios no se movieron
    const deLuis = (await send.execute({ conversationId: 'c1', authorId: 'luis', content: 'mío' })).id;
    await expect(edit.execute({ conversationId: 'c1', messageId: deLuis, editorId: 'ana', content: 'hackeo' })).rejects.toThrow(/propios/);
  });

  it('exige ser miembro, que el mensaje sea de esa conversación y que haya cambios reales', async () => {
    const { edit, send, ids } = await conCincoMensajes();
    await expect(edit.execute({ conversationId: 'c1', messageId: ids[4], editorId: 'intruso', content: 'x' })).rejects.toBeInstanceOf(ForbiddenError);
    const deOtroChat = (await send.execute({ conversationId: 'c2', authorId: 'luis', content: 'otro chat' })).id;
    await expect(edit.execute({ conversationId: 'c1', messageId: deOtroChat, editorId: 'luis', content: 'x' })).rejects.toBeInstanceOf(NotFoundError);
    await expect(edit.execute({ conversationId: 'c1', messageId: ids[4], editorId: 'ana', content: 'mensaje 5' })).rejects.toThrow(/cambios/);
  });

  it('valida el texto: no vacío (salvo que el mensaje lleve imagen), máx. 4000 y solo texto', async () => {
    const { edit, ids } = await conCincoMensajes();
    await expect(edit.execute({ conversationId: 'c1', messageId: ids[4], editorId: 'ana', content: '   ' })).rejects.toBeInstanceOf(ValidationError);
    await expect(edit.execute({ conversationId: 'c1', messageId: ids[4], editorId: 'ana', content: 'x'.repeat(4001) })).rejects.toBeInstanceOf(ValidationError);
    await expect(edit.execute({ conversationId: 'c1', messageId: ids[4], editorId: 'ana', content: { $ne: 1 } as never })).rejects.toBeInstanceOf(ValidationError);
    await expect(edit.execute({ conversationId: 'c1', messageId: ids[4], editorId: 'ana', content: 'x'.repeat(4000) })).resolves.toBeDefined();
  });

  it('cada edición agrega una entrada al historial (nunca se pierde el texto anterior)', async () => {
    const { edit, msgs, ids } = await conCincoMensajes();
    await edit.execute({ conversationId: 'c1', messageId: ids[4], editorId: 'ana', content: 'v2' });
    await edit.execute({ conversationId: 'c1', messageId: ids[4], editorId: 'ana', content: 'v3' });
    expect(msgs.rows[4].edits.map((e) => e.previousContent)).toEqual(['mensaje 5', 'v2']);
  });
});

describe('Imágenes', () => {
  it('sube una imagen válida: tipo y medidas salen del contenido, y queda en espera', async () => {
    const { convs, images, storage } = setup();
    const up = new UploadChatImageUseCase(convs as never, images as never, storage);
    const out = await up.execute({ conversationId: 'c1', uploaderId: 'ana', body: PNG, originalName: 'C:\\fotos\\foto.png' });
    expect(out).toMatchObject({ mimeType: 'image/png', width: 40, height: 30, fileName: 'foto.png', sizeBytes: PNG.length });
    expect([...storage.files.keys()][0]).toMatch(/^chat-images\/[0-9a-f-]{36}$/);
  });

  it('rechaza lo que no es imagen (aunque el nombre diga .png), lo vacío y lo demasiado grande', async () => {
    const { convs, images, storage } = setup();
    const up = new UploadChatImageUseCase(convs as never, images as never, storage);
    const base = { conversationId: 'c1', uploaderId: 'ana' };
    await expect(up.execute({ ...base, body: Buffer.from('<svg onload=alert(1)>'), originalName: 'a.png' })).rejects.toThrow(/PNG, JPEG, GIF o WebP/);
    await expect(up.execute({ ...base, body: Buffer.alloc(0) })).rejects.toBeInstanceOf(ValidationError);
    await expect(up.execute({ ...base, body: Buffer.alloc(5 * 1024 * 1024 + 1) })).rejects.toThrow(/5 MB/);
    expect(storage.files.size).toBe(0);
  });

  it('un ajeno a la conversación no puede subir; y hay tope de subidas sin enviar', async () => {
    const { convs, images, storage } = setup();
    const up = new UploadChatImageUseCase(convs as never, images as never, storage);
    await expect(up.execute({ conversationId: 'c1', uploaderId: 'pablo', body: PNG })).rejects.toBeInstanceOf(ForbiddenError);
    for (let i = 0; i < 20; i++) await up.execute({ conversationId: 'c1', uploaderId: 'ana', body: PNG });
    await expect(up.execute({ conversationId: 'c1', uploaderId: 'ana', body: PNG })).rejects.toThrow(/demasiadas/);
    await expect(up.execute({ conversationId: 'c1', uploaderId: 'luis', body: PNG })).resolves.toBeDefined(); // el tope es por persona
  });

  it('enviar mensaje con imágenes: solo las propias, de esa conversación y sin usar; máx. 10; sin repetir', async () => {
    const { convs, images, storage, send } = setup();
    const up = new UploadChatImageUseCase(convs as never, images as never, storage);
    const mine = await up.execute({ conversationId: 'c1', uploaderId: 'ana', body: PNG });
    const luisPic = await up.execute({ conversationId: 'c1', uploaderId: 'luis', body: PNG });
    const base = { conversationId: 'c1', authorId: 'ana' };
    await expect(send.execute({ ...base, imageIds: [luisPic.id] })).rejects.toBeInstanceOf(ValidationError); // imagen de otra persona
    await expect(send.execute({ ...base, imageIds: ['no-existe'] })).rejects.toBeInstanceOf(ValidationError);
    await expect(send.execute({ ...base, imageIds: [mine.id, mine.id] })).rejects.toThrow(/repetidas/);
    await expect(send.execute({ ...base, imageIds: Array.from({ length: 11 }, (_, i) => `i${i}`) })).rejects.toThrow(/Máximo 10/);
    const ok = await send.execute({ ...base, imageIds: [mine.id] }); // una imagen sola, sin texto, es un mensaje válido
    expect(ok.images).toHaveLength(1);
  });

  it('GetChatImage: miembros sí; ajenos no; una subida sin enviar solo la ve quien la subió; mismo error para todo lo demás', async () => {
    const { convs, images, storage } = setup();
    const up = new UploadChatImageUseCase(convs as never, images as never, storage);
    const get = new GetChatImageUseCase(convs as never, images as never, storage);
    const pic = await up.execute({ conversationId: 'c1', uploaderId: 'ana', body: PNG });
    await expect(get.execute({ conversationId: 'c1', imageId: pic.id, userId: 'ana' })).resolves.toBeDefined();
    await expect(get.execute({ conversationId: 'c1', imageId: pic.id, userId: 'luis' })).rejects.toBeInstanceOf(NotFoundError); // aún sin enviar
    images.rows[0].messageId = 'm1'; // ya enviada
    await expect(get.execute({ conversationId: 'c1', imageId: pic.id, userId: 'luis' })).resolves.toBeDefined();
    await expect(get.execute({ conversationId: 'c1', imageId: pic.id, userId: 'pablo' })).rejects.toBeInstanceOf(ForbiddenError);
    await expect(get.execute({ conversationId: 'c2', imageId: pic.id, userId: 'pablo' })).rejects.toBeInstanceOf(NotFoundError); // imagen de OTRA conversación
  });
});

describe('Entregado / leído con fecha y hora', () => {
  class Receipts implements ReceiptRepository {
    calls: unknown[] = [];
    constructor(private readonly onDelivered: ReceiptUpdate[] = [], private readonly onRead: ReceiptUpdate[] = []) {}
    async markDelivered(i: Parameters<ReceiptRepository['markDelivered']>[0]) { this.calls.push(['delivered', i]); return this.onDelivered; }
    async markRead(i: Parameters<ReceiptRepository['markRead']>[0]) { this.calls.push(['read', i]); return this.onRead; }
  }
  const upd = (over: Partial<ReceiptUpdate> = {}): ReceiptUpdate => ({
    messageId: 'm1', conversationId: 'c1', authorId: 'ana', userId: 'luis', userName: 'Luis', deliveredAt: at(5), readAt: null, ...over,
  });

  it('entrega a los conectados: registra y publica una novedad que recibirá quien envió', async () => {
    const events = new EventEmitter2(); const seen: unknown[] = [];
    events.on('chat.receipts.updated', (u) => seen.push(u));
    const receipts = new Receipts([upd()]);
    await new RecordDeliveryUseCase(receipts, events).forMessage({ messageId: 'm1', userIds: ['luis', 'marta'] });
    expect(receipts.calls).toEqual([['delivered', { userId: 'luis', messageId: 'm1' }], ['delivered', { userId: 'marta', messageId: 'm1' }]]);
    expect(seen).toHaveLength(1);
  });

  it('al conectarse entrega todo lo pendiente; si no había nada, no publica', async () => {
    const events = new EventEmitter2(); const seen: unknown[] = [];
    events.on('chat.receipts.updated', (u) => seen.push(u));
    await new RecordDeliveryUseCase(new Receipts([]), events).onConnect('luis');
    expect(seen).toHaveLength(0);
    await new RecordDeliveryUseCase(new Receipts([upd()]), events).onConnect('luis');
    expect(seen).toHaveLength(1);
  });

  it('marcar como leído registra el «leído» y lo publica; un ajeno no puede', async () => {
    const events = new EventEmitter2(); const seen: unknown[] = [];
    events.on('chat.receipts.updated', (u) => seen.push(u));
    const receipts = new Receipts([], [upd({ readAt: at(9) })]);
    const uc = new MarkReadUseCase(new Convs({ c1: ['ana', 'luis'] }) as never, receipts, events);
    await uc.execute({ conversationId: 'c1', userId: 'luis' });
    expect(receipts.calls).toEqual([['read', { conversationId: 'c1', userId: 'luis' }]]);
    expect(seen).toHaveLength(1);
    await expect(uc.execute({ conversationId: 'c1', userId: 'intruso' })).rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe('Trazabilidad del mensaje', () => {
  it('solo su autor la ve: enviado, estado, entrega y lectura por destinatario, y ediciones con fecha', async () => {
    const { send, edit, msgs, convs } = setup();
    const m = await send.execute({ conversationId: 'c1', authorId: 'ana', content: 'original' });
    msgs.rows[0].receipts[0] = { userId: 'luis', userName: 'Luis', deliveredAt: at(3), readAt: at(8) };
    msgs.rows[0].receipts[1] = { userId: 'marta', userName: 'Marta', deliveredAt: at(4), readAt: null };
    await edit.execute({ conversationId: 'c1', messageId: m.id, editorId: 'ana', content: 'corregido' });

    const trace = new MessageTraceUseCase(convs as never, msgs as never);
    const t = await trace.execute({ conversationId: 'c1', messageId: m.id, userId: 'ana' });
    expect(t.sentAt).toEqual(at(1));
    expect(t.status).toBe('DELIVERED'); // Marta aún no lo lee
    expect(t.receipts).toEqual([
      { userId: 'luis', userName: 'Luis', deliveredAt: at(3), readAt: at(8) },
      { userId: 'marta', userName: 'Marta', deliveredAt: at(4), readAt: null },
    ]);
    expect(t.edits).toEqual([{ at: at(100), editorId: 'ana', previousContent: 'original' }]);

    await expect(trace.execute({ conversationId: 'c1', messageId: m.id, userId: 'luis' })).rejects.toThrow(/Solo quien envió/);
    await expect(trace.execute({ conversationId: 'c1', messageId: m.id, userId: 'pablo' })).rejects.toBeInstanceOf(ForbiddenError);
    await expect(trace.execute({ conversationId: 'c2', messageId: m.id, userId: 'luis' })).rejects.toBeInstanceOf(NotFoundError);
  });

  it('los acuses solo viajan para el autor: otros miembros reciben el mensaje sin ellos', async () => {
    const { send, msgs } = setup();
    const m = await send.execute({ conversationId: 'c1', authorId: 'ana', content: 'hola' });
    expect((await msgs.view(m.id, 'ana'))!.receipts).toHaveLength(2);
    expect((await msgs.view(m.id, 'luis'))!.receipts).toBeUndefined();
    expect((await msgs.view(m.id))!.receipts).toBeUndefined();
  });
});
