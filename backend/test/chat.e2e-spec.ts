import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { gradientPng } from '../prisma/png';
import { DEMO_CONVERSATIONS, seedChat } from '../prisma/seed-chat';
import { RecordDeliveryUseCase } from '../src/modules/chat/application/record-delivery.use-case';
import { createApp, createUser, login, prisma, resetDb, trustDevice, XRW } from './helpers';

const API = '/api/v1';
let app: INestApplication;
const ids: Record<string, string> = {};
const loadIds = async () => { for (const u of await prisma.user.findMany()) ids[u.email] = u.id; };

beforeAll(async () => { app = await createApp(); });
afterAll(async () => { await app.close(); await prisma.$disconnect(); });
beforeEach(resetDb);

/** Inicia sesión como un usuario del seed (su equipo ya aprobado) y devuelve su "navegador". */
async function as(email: string, password: string) {
  const user = await prisma.user.findUniqueOrThrow({ where: { email } });
  ids[email] = user.id;
  const { key } = await trustDevice(user.id);
  const { res, agent } = await login(app, email, password, key);
  if (res.status !== 200) throw new Error(`login ${email}: ${res.status}`);
  return agent;
}
const ANA = ['ana@empresa.com', 'Segura#2026A'] as const;
const LUIS = ['luis@empresa.com', 'Segura#2026L'] as const;
const MARTA = ['marta@empresa.com', 'Demo#Iris2026'] as const;

describe('Seed de mensajería', () => {
  it('crea usuarios, conversaciones, mensajes, adjuntos y documentos; y se puede repetir sin duplicar', async () => {
    const first = await seedChat(prisma);
    const total = DEMO_CONVERSATIONS.reduce((n, c) => n + c.messages.length, 0);
    expect(first).toMatchObject({ users: 9, conversations: 8, messages: total, documents: 4 });
    expect(first.attachments).toBeGreaterThanOrEqual(6);

    const second = await seedChat(prisma);
    expect(second).toEqual(first);
    expect(await prisma.conversation.count()).toBe(8);
    expect(await prisma.message.count()).toBe(total);
    expect(await prisma.user.count()).toBe(9);
    expect(await prisma.document.count()).toBe(4);
  });

  it('vuelve a fechar los mensajes respecto de "ahora" (hoy/ayer siempre actuales)', async () => {
    const ahora = new Date('2027-03-10T15:00:00Z');
    await seedChat(prisma, { now: ahora });
    const ultimo = await prisma.message.findFirstOrThrow({ orderBy: { createdAt: 'desc' } });
    expect(ahora.getTime() - ultimo.createdAt.getTime()).toBeLessThan(60 * 60_000);
    expect(ultimo.createdAt.getTime()).toBeLessThanOrEqual(ahora.getTime());
  });

  it('no toca las conversaciones reales de la gente ni pisa contraseñas de usuarios existentes', async () => {
    const ana = await createUser('ana@empresa.com');
    const hashAntes = ana.passwordHash;
    const real = await prisma.conversation.create({ data: { type: 'GROUP', name: 'Mi grupo real', members: { create: [{ userId: ana.id }] } } });
    await prisma.message.create({ data: { conversationId: real.id, authorId: ana.id, content: 'no me borres' } });
    await seedChat(prisma);
    expect(await prisma.message.count({ where: { conversationId: real.id } })).toBe(1);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: ana.id } })).passwordHash).toBe(hashAntes);
  });

  it('un chat directo real ya existente entre dos personas se reutiliza (no choca con el índice único)', async () => {
    const ana = await createUser('ana@empresa.com'); const luis = await createUser('luis@empresa.com');
    await prisma.conversation.create({
      data: { type: 'DIRECT', directKey: [ana.id, luis.id].sort().join(':'), members: { create: [{ userId: ana.id }, { userId: luis.id }] } },
    });
    await expect(seedChat(prisma)).resolves.toBeDefined();
    expect(await prisma.conversation.count({ where: { type: 'DIRECT', directKey: [ana.id, luis.id].sort().join(':') } })).toBe(1);
  });
});

describe('Lo que ve cada persona con los datos del seed', () => {
  beforeEach(async () => { await seedChat(prisma); await loadIds(); });

  it('Ana ve SUS 7 conversaciones (no el directo entre Luis y Pablo), ordenadas por el último mensaje', async () => {
    const ana = await as(...ANA);
    const res = await ana.get(`${API}/conversations`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(7);
    expect(res.body.map((c: { name: string }) => c.name)).not.toContain('Pablo Rivas');
    const fechas = res.body.map((c: { lastMessage: { at: string } }) => new Date(c.lastMessage.at).getTime());
    expect([...fechas].sort((a, b) => b - a)).toEqual(fechas);
  });

  it('los no leídos salen tal cual el seed los diseñó, y los directos se nombran por la OTRA persona', async () => {
    const ana = await as(...ANA);
    const por = Object.fromEntries((await ana.get(`${API}/conversations`)).body.map((c: { name: string; unread: number }) => [c.name, c.unread]));
    expect(por).toMatchObject({
      'Luis Rojas': 2, 'Marta Rojas': 3, 'Carlos Mendoza (Admin)': 0, Contabilidad: 5,
      'Auditoría interna 2026': 0, 'Compras y proveedores': 1, 'Avisos generales': 1,
    });
  });

  it('abrir una conversación la marca como leída; las demás siguen igual', async () => {
    const ana = await as(...ANA);
    const lista = (await ana.get(`${API}/conversations`)).body;
    const conta = lista.find((c: { name: string }) => c.name === 'Contabilidad');
    const msgs = await ana.get(`${API}/conversations/${conta.id}/messages`);
    expect(msgs.status).toBe(200);
    expect(msgs.body.items.length).toBeGreaterThan(15);
    expect(msgs.body.items.length).toBeLessThanOrEqual(20); // una página, no todo el historial
    const despues = Object.fromEntries((await ana.get(`${API}/conversations`)).body.map((c: { name: string; unread: number }) => [c.name, c.unread]));
    expect(despues.Contabilidad).toBe(0);
    expect(despues['Marta Rojas']).toBe(3);
  });

  it('los mensajes vienen en orden cronológico, con autor y con el documento adjunto (nombre, tipo y tamaño)', async () => {
    const ana = await as(...ANA);
    const conta = (await ana.get(`${API}/conversations`)).body.find((c: { name: string }) => c.name === 'Contabilidad');
    const msgs = (await ana.get(`${API}/conversations/${conta.id}/messages`)).body.items;
    const t = msgs.map((m: { createdAt: string }) => new Date(m.createdAt).getTime());
    expect([...t].sort((a, b) => a - b)).toEqual(t);
    expect(msgs[0]).toHaveProperty('authorName');
    const conAdjunto = (await ana.get(`${API}/conversations/${conta.id}/messages?limit=50`)).body.items.find((m: { attachments: unknown[] }) => m.attachments.length);
    expect(conAdjunto.attachments[0]).toMatchObject({ fileName: 'cierre-contable-octubre.pdf', mimeType: 'application/pdf', versionNumber: 1 });
    expect(conAdjunto.attachments[0].sizeBytes).toBeGreaterThan(300);
  });

  it('el adjunto se puede DESCARGAR de verdad: es un PDF y la descarga queda registrada con el canal del chat', async () => {
    const ana = await as(...ANA);
    const conta = (await ana.get(`${API}/conversations`)).body.find((c: { name: string }) => c.name === 'Contabilidad');
    const adj = (await ana.get(`${API}/conversations/${conta.id}/messages?limit=50`)).body.items.find((m: { attachments: unknown[] }) => m.attachments.length).attachments[0];
    const dl = await ana.get(`${API}/documents/${adj.documentId}/download?versionId=${adj.versionId}&channel=chat:${conta.id}`)
      .buffer(true).parse((res, cb) => { const chunks: Buffer[] = []; res.on('data', (c) => chunks.push(c)); res.on('end', () => cb(null, Buffer.concat(chunks))); });
    expect(dl.status).toBe(200);
    expect((dl.body as Buffer).subarray(0, 5).toString()).toBe('%PDF-');
    expect(String((dl.body as Buffer).subarray(-6))).toContain('%%EOF');
  });

  it('AISLAMIENTO: quien no es miembro no puede leer la conversación ni descargar su documento', async () => {
    const marta = await as(...MARTA);
    const ajena = DEMO_CONVERSATIONS.find((c) => c.members.join() === 'luis,pablo')!;
    expect((await marta.get(`${API}/conversations/${ajena.id}/messages`)).status).toBe(403);
    expect((await marta.post(`${API}/conversations/${ajena.id}/messages`).set(XRW).send({ content: 'intruso' })).status).toBe(403);
    const audit = await prisma.document.findUniqueOrThrow({ where: { codigo: 'DEMO-AUD-003' } });
    const dl = await marta.get(`${API}/documents/${audit.id}/download`);
    expect([403, 404]).toContain(dl.status); // Marta no está en "Auditoría interna"
  });

  it('enviar un mensaje a un chat del seed lo agrega y lo ven los demás', async () => {
    const ana = await as(...ANA); const luis = await as(...LUIS);
    const conv = (await ana.get(`${API}/conversations`)).body.find((c: { name: string }) => c.name === 'Luis Rojas');
    const sent = await ana.post(`${API}/conversations/${conv.id}/messages`).set(XRW).send({ content: 'Visto bueno dado ✅' });
    expect(sent.status).toBe(201);
    const vistoPorLuis = (await luis.get(`${API}/conversations/${conv.id}/messages`)).body.items.at(-1);
    expect(vistoPorLuis).toMatchObject({ content: 'Visto bueno dado ✅', authorName: 'Ana Quispe' });
  });
});

describe('Crear conversaciones', () => {
  beforeEach(async () => { await seedChat(prisma); await loadIds(); });
  const post = (agent: request.Agent, body: object) => agent.post(`${API}/conversations`).set(XRW).send(body);

  it('GET /conversations/contacts: usuarios activos, nunca uno mismo; busca por nombre o correo', async () => {
    const ana = await as(...ANA);
    const todos = (await ana.get(`${API}/conversations/contacts`)).body as Array<{ id: string; name: string; email: string }>;
    expect(todos).toHaveLength(8);
    expect(todos.map((c) => c.email)).not.toContain('ana@empresa.com');
    expect(todos.map((c) => c.name)).toEqual([...todos.map((c) => c.name)].sort((a, b) => a.localeCompare(b)));
    expect(Object.keys(todos[0]).sort()).toEqual(['email', 'id', 'name']); // nada de hashes, roles ni estados
    const rojas = (await ana.get(`${API}/conversations/contacts?q=ROJAS`)).body as Array<{ name: string }>;
    expect(rojas.map((c) => c.name).sort()).toEqual(['Luis Rojas', 'Marta Rojas']);
    expect((await ana.get(`${API}/conversations/contacts?q=jorge@`)).body).toHaveLength(1);
  });

  it('los usuarios deshabilitados o pendientes NO aparecen como contactos', async () => {
    const ana = await as(...ANA);
    await prisma.user.update({ where: { email: 'diego@empresa.com' }, data: { status: 'DISABLED' } });
    await prisma.user.update({ where: { email: 'carla@empresa.com' }, data: { status: 'PENDING' } });
    const nombres = (await ana.get(`${API}/conversations/contacts`)).body.map((c: { name: string }) => c.name);
    expect(nombres).not.toContain('Diego Pérez');
    expect(nombres).not.toContain('Carla Soto');
  });

  it('chat directo nuevo con alguien sin chat previo: se crea y queda en la lista', async () => {
    const ana = await as(...ANA);
    const carla = await prisma.user.findUniqueOrThrow({ where: { email: 'carla@empresa.com' } });
    const res = await post(ana, { type: 'DIRECT', memberIds: [carla.id] });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ created: true, conversation: { type: 'DIRECT', name: 'Carla Soto', unread: 0 } });
    expect((await ana.get(`${API}/conversations`)).body).toHaveLength(8);
  });

  it('si ya existe el chat directo, devuelve ese (created:false) y NO crea otro, desde cualquiera de los dos lados', async () => {
    const ana = await as(...ANA); const luis = await as(...LUIS);
    const antes = await prisma.conversation.count();
    const r1 = await post(ana, { type: 'DIRECT', memberIds: [ids['luis@empresa.com']] });
    const r2 = await post(luis, { type: 'DIRECT', memberIds: [ids['ana@empresa.com']] });
    expect([r1.body.created, r2.body.created]).toEqual([false, false]);
    expect(r1.body.conversation.id).toBe(r2.body.conversation.id);
    expect(r1.body.conversation.unread).toBe(2); // y conserva sus mensajes sin leer
    expect(await prisma.conversation.count()).toBe(antes);
  });

  it('dos personas que se escriben A LA VEZ terminan con UN solo chat (lo garantiza la base de datos)', async () => {
    const ana = await as(...ANA); const marta = await as(...MARTA);
    const clave = [ids['ana@empresa.com'], ids['marta@empresa.com']].sort().join(':');
    // se parte sin chat previo entre ambas
    const previo = await prisma.conversation.findUnique({ where: { directKey: clave } });
    if (previo) {
      await prisma.messageAttachment.deleteMany({ where: { message: { conversationId: previo.id } } });
      await prisma.message.deleteMany({ where: { conversationId: previo.id } });
      await prisma.conversationMember.deleteMany({ where: { conversationId: previo.id } });
      await prisma.conversation.delete({ where: { id: previo.id } });
    }
    const [a, b] = await Promise.all([
      post(ana, { type: 'DIRECT', memberIds: [ids['marta@empresa.com']] }),
      post(marta, { type: 'DIRECT', memberIds: [ids['ana@empresa.com']] }),
    ]);
    expect([a.status, b.status]).toEqual([201, 201]); // ninguno falla
    expect(a.body.conversation.id).toBe(b.body.conversation.id); // y ambos abren el mismo
    expect(await prisma.conversation.count({ where: { directKey: clave } })).toBe(1);
  });

  it('grupo nuevo: el creador queda dentro, el nombre se normaliza, y los demás lo ven sin leer nada', async () => {
    const ana = await as(...ANA); const marta = await as(...MARTA);
    const r = await post(ana, { type: 'GROUP', name: '  Proyecto   Piloto ', memberIds: [ids['marta@empresa.com'], ids['luis@empresa.com']] });
    expect(r.status).toBe(201);
    expect(r.body.conversation).toMatchObject({ type: 'GROUP', name: 'Proyecto Piloto' });
    expect(r.body.conversation.members.map((m: { name: string }) => m.name).sort()).toEqual(['Ana Quispe', 'Luis Rojas', 'Marta Rojas']);
    const enLaListaDeMarta = (await marta.get(`${API}/conversations`)).body.find((c: { name: string }) => c.name === 'Proyecto Piloto');
    expect(enLaListaDeMarta).toBeDefined();
    expect(enLaListaDeMarta.lastMessage).toBeUndefined();
  });

  it('dos grupos con las mismas personas y distinto nombre son grupos distintos', async () => {
    const ana = await as(...ANA);
    const m = [ids['marta@empresa.com'], ids['luis@empresa.com']];
    const a = await post(ana, { type: 'GROUP', name: 'Grupo A', memberIds: m });
    const b = await post(ana, { type: 'GROUP', name: 'Grupo B', memberIds: m });
    expect(a.body.conversation.id).not.toBe(b.body.conversation.id);
  });

  it('validaciones: contigo mismo, grupo sin nombre o con menos de 2 personas, ids inválidos y campos extra', async () => {
    const ana = await as(...ANA);
    const luis = ids['luis@empresa.com'];
    const yo = ids['ana@empresa.com'];
    expect((await post(ana, { type: 'DIRECT', memberIds: [yo] })).status).toBe(400);
    expect((await post(ana, { type: 'GROUP', name: '', memberIds: [luis, ids['marta@empresa.com']] })).status).toBe(400);
    expect((await post(ana, { type: 'GROUP', name: 'Solo dos', memberIds: [luis] })).status).toBe(400);
    expect((await post(ana, { type: 'DIRECT', memberIds: ['no-es-uuid'] })).status).toBe(400);
    expect((await post(ana, { type: 'CANAL', memberIds: [luis] })).status).toBe(400);
    expect((await post(ana, { type: 'DIRECT', memberIds: [luis], admin: true })).status).toBe(400);
    expect((await post(ana, { type: 'GROUP', name: 'x'.repeat(81), memberIds: [luis, yo] })).status).toBe(400);
  });

  it('personas inexistentes, deshabilitadas o pendientes se rechazan con el MISMO mensaje', async () => {
    const ana = await as(...ANA);
    await prisma.user.update({ where: { email: 'diego@empresa.com' }, data: { status: 'DISABLED' } });
    const diego = (await prisma.user.findUniqueOrThrow({ where: { email: 'diego@empresa.com' } })).id;
    const a = await post(ana, { type: 'DIRECT', memberIds: [diego] });
    const b = await post(ana, { type: 'DIRECT', memberIds: ['11111111-1111-4111-8111-111111111111'] });
    expect([a.status, b.status]).toEqual([400, 400]);
    expect(b.body.message).toBe(a.body.message);
  });

  it('exige sesión y la cabecera anti-CSRF', async () => {
    expect((await request(app.getHttpServer()).get(`${API}/conversations/contacts`)).status).toBe(401);
    expect((await request(app.getHttpServer()).post(`${API}/conversations`).set(XRW).send({ type: 'DIRECT', memberIds: [] })).status).toBe(401);
    const ana = await as(...ANA);
    expect((await ana.post(`${API}/conversations`).send({ type: 'DIRECT', memberIds: [] })).status).toBe(403);
  });
});

describe('Marcar como leído', () => {
  beforeEach(async () => { await seedChat(prisma); await loadIds(); });

  it('POST /conversations/:id/read deja en 0 los no leídos de quien la está viendo (mensajes que llegan en vivo)', async () => {
    const ana = await as(...ANA); const luis = await as(...LUIS);
    const conv = (await ana.get(`${API}/conversations`)).body.find((c: { name: string }) => c.name === 'Luis Rojas');
    await ana.get(`${API}/conversations/${conv.id}/messages`); // al abrirla queda en 0
    await luis.post(`${API}/conversations/${conv.id}/messages`).set(XRW).send({ content: 'Llegó un mensaje nuevo' });
    const ver = async () => (await ana.get(`${API}/conversations`)).body.find((c: { name: string }) => c.name === 'Luis Rojas').unread;
    expect(await ver()).toBe(1);
    expect((await ana.post(`${API}/conversations/${conv.id}/read`).set(XRW)).status).toBe(204);
    expect(await ver()).toBe(0);
  });

  it('solo los miembros pueden marcarla, y el id debe ser un UUID', async () => {
    const marta = await as(...MARTA);
    const ajena = DEMO_CONVERSATIONS.find((c) => c.members.join() === 'luis,pablo')!;
    expect((await marta.post(`${API}/conversations/${ajena.id}/read`).set(XRW)).status).toBe(403);
    expect((await marta.post(`${API}/conversations/no-es-uuid/read`).set(XRW)).status).toBe(400);
  });
});

describe('Límites del mensaje (REST)', () => {
  beforeEach(async () => { await seedChat(prisma); await loadIds(); });

  it('4000 caracteres entran; 4001 se rechazan; vacío se rechaza', async () => {
    const ana = await as(...ANA);
    const conv = (await ana.get(`${API}/conversations`)).body[0];
    const send = (content: string) => ana.post(`${API}/conversations/${conv.id}/messages`).set(XRW).send({ content });
    expect((await send('x'.repeat(4000))).status).toBe(201);
    expect((await send('x'.repeat(4001))).status).toBe(400);
    expect((await send('   ')).status).toBe(400);
  });
});

describe('Paginación del historial (más nuevo → más viejo)', () => {
  const T0 = Date.parse('2026-01-01T10:00:00.000Z');
  /** Grupo con 55 mensajes; los 10 más recientes comparten el MISMO instante (desempata por id). */
  async function grupoConHistorial() {
    await seedChat(prisma); await loadIds();
    const ana = await as(...ANA);
    const r = await ana.post(`${API}/conversations`).set(XRW).send({ type: 'GROUP', name: 'Historial largo', memberIds: [ids['marta@empresa.com'], ids['luis@empresa.com']] });
    const conv = r.body.conversation.id as string;
    const data = Array.from({ length: 55 }, (_, i) => ({
      conversationId: conv, authorId: ids['marta@empresa.com'], content: `m${String(i).padStart(2, '0')}`,
      createdAt: new Date(i >= 45 ? T0 + 45_000 : T0 + i * 1000),
    }));
    await prisma.message.createMany({ data });
    return { ana, conv };
  }
  type Agent = Awaited<ReturnType<typeof as>>;
  const get = (agent: Agent, conv: string, qs = '') => agent.get(`${API}/conversations/${conv}/messages${qs}`);

  it('la primera página trae solo los 20 más recientes, en orden cronológico, con cursor al siguiente tramo', async () => {
    const { ana, conv } = await grupoConHistorial();
    const r = await get(ana, conv);
    expect(r.status).toBe(200);
    expect(r.body.items).toHaveLength(20);
    expect(r.body.nextCursor).toEqual(expect.any(String));
    const t = r.body.items.map((m: { createdAt: string }) => Date.parse(m.createdAt));
    expect([...t].sort((a, b) => a - b)).toEqual(t);
    expect(r.body.items.at(-1).content).toMatch(/^m(4[5-9]|5[0-4])$/); // los más nuevos
  });

  it('recorrer todas las páginas devuelve los 55 mensajes, sin repetir ni saltar ninguno (incluso con la misma hora)', async () => {
    const { ana, conv } = await grupoConHistorial();
    const vistos: string[] = [];
    let cursor: string | null = null; let paginas = 0;
    do {
      const r = await get(ana, conv, `?limit=20${cursor ? `&before=${cursor}` : ''}`);
      expect(r.status).toBe(200);
      vistos.unshift(...r.body.items.map((m: { id: string }) => m.id));
      cursor = r.body.nextCursor; paginas++;
    } while (cursor);
    expect(paginas).toBe(3);
    expect(vistos).toHaveLength(55);
    expect(new Set(vistos).size).toBe(55);
  });

  it('un mensaje nuevo mientras se navega no desplaza las páginas antiguas (cursor por clave, no por posición)', async () => {
    const { ana, conv } = await grupoConHistorial();
    const p1 = await get(ana, conv);
    await ana.post(`${API}/conversations/${conv}/messages`).set(XRW).send({ content: 'llegó mientras leía' });
    const p2 = await get(ana, conv, `?before=${p1.body.nextCursor}`);
    const ids1 = new Set(p1.body.items.map((m: { id: string }) => m.id));
    expect(p2.body.items.some((m: { id: string }) => ids1.has(m.id))).toBe(false);
    expect(p2.body.items).toHaveLength(20);
  });

  it('el límite se acota (máx. 50) y valores absurdos se rechazan', async () => {
    const { ana, conv } = await grupoConHistorial();
    expect((await get(ana, conv, '?limit=50')).body.items).toHaveLength(50);
    expect((await get(ana, conv, '?limit=500')).status).toBe(400);
    expect((await get(ana, conv, '?limit=0')).status).toBe(400);
    expect((await get(ana, conv, '?limit=abc')).status).toBe(400);
  });

  it('un cursor manipulado se rechaza (400) y no permite leer otra conversación', async () => {
    const { ana, conv } = await grupoConHistorial();
    expect((await get(ana, conv, '?before=cualquier-cosa')).status).toBe(400);
    const inyeccion = Buffer.from("2026-01-01T00:00:00.000Z|x' OR 1=1 --").toString('base64url');
    expect((await get(ana, conv, `?before=${inyeccion}`)).status).toBe(400);
    const ajena = DEMO_CONVERSATIONS.find((c) => c.members.join() === 'luis,pablo')!;
    expect((await get(ana, ajena.id)).status).toBe(403);
  });

  it('pedir páginas antiguas NO marca como leído; abrir la conversación (sin cursor) sí', async () => {
    const { ana, conv } = await grupoConHistorial();
    const luis = await as(...LUIS);
    const p1 = await get(luis, conv); // Luis abre: queda leído
    const unread = async () => (await luis.get(`${API}/conversations`)).body.find((c: { id: string }) => c.id === conv).unread;
    expect(await unread()).toBe(0);
    await ana.post(`${API}/conversations/${conv}/messages`).set(XRW).send({ content: 'nuevo' });
    expect(await unread()).toBe(1);
    await get(luis, conv, `?before=${p1.body.nextCursor}`); // solo scroll hacia atrás
    expect(await unread()).toBe(1);
  });

  it('la lista de chats no trae historial: solo el último mensaje y los no leídos de cada chat', async () => {
    const { ana } = await grupoConHistorial();
    const lista = (await ana.get(`${API}/conversations`)).body;
    const grupo = lista.find((c: { name: string }) => c.name === 'Historial largo');
    expect(grupo.lastMessage.text).toBeTruthy();
    expect(lista.find((c: { name: string }) => c.name === 'Contabilidad').unread).toBe(5);
  });
});

// ===================================================================================================
// Responder, editar (últimos 3), imágenes y acuses con fecha y hora
// ===================================================================================================
const C_CONTA = '00000000-0000-4000-8000-00000000c005';
const C_AUDIT = '00000000-0000-4000-8000-00000000c006';
const png = (w = 64, h = 48) => gradientPng(w, h, [20, 90, 200], [30, 190, 120]);

type Agent = Awaited<ReturnType<typeof as>>;
async function grupoNuevo(ana: Agent, nombre = 'Equipo de pruebas') {
  const r = await ana.post(`${API}/conversations`).set(XRW).send({ type: 'GROUP', name: nombre, memberIds: [ids['luis@empresa.com'], ids['marta@empresa.com']] });
  return r.body.conversation.id as string;
}
const enviar = (a: Agent, conv: string, body: Record<string, unknown>) => a.post(`${API}/conversations/${conv}/messages`).set(XRW).send(body);
const historial = async (a: Agent, conv: string, qs = '') => (await a.get(`${API}/conversations/${conv}/messages${qs}`)).body.items as any[]; // eslint-disable-line @typescript-eslint/no-explicit-any
const subir = (a: Agent, conv: string, buf: Buffer, nombre = 'foto.png') => a.post(`${API}/conversations/${conv}/images`).set(XRW).attach('file', buf, nombre);

describe('Datos de demostración: respuestas, imágenes, ediciones y acuses', () => {
  beforeEach(async () => { await seedChat(prisma); await loadIds(); });

  it('el seed deja imágenes reales, respuestas, ediciones y un acuse por destinatario', async () => {
    const r = await seedChat(prisma);
    expect(r.images).toBe(3);
    expect(r.replies).toBeGreaterThanOrEqual(2);
    expect(r.edits).toBe(1);
    expect(await prisma.messageReceipt.count()).toBe(r.receipts);
    expect(await prisma.messageImage.count()).toBe(3);
  });

  it('un mensaje con imagen se lee con sus medidas y la imagen se descarga como PNG de verdad', async () => {
    const ana = await as(...ANA);
    const msgs = await historial(ana, C_CONTA, '?limit=50');
    const conImagen = msgs.find((m) => m.images.length);
    expect(conImagen.images[0]).toMatchObject({ mimeType: 'image/png', width: expect.any(Number), height: expect.any(Number) });
    const img = await ana.get(`${API}/conversations/${C_CONTA}/images/${conImagen.images[0].id}`).buffer(true).parse((res, cb) => { const c: Buffer[] = []; res.on('data', (d) => c.push(d)); res.on('end', () => cb(null, Buffer.concat(c))); });
    expect(img.status).toBe(200);
    expect(img.headers['content-type']).toBe('image/png');
    expect(img.headers['x-content-type-options']).toBe('nosniff');
    expect(img.headers['content-security-policy']).toContain("default-src 'none'");
    expect(img.headers['cache-control']).toContain('private');
    expect((img.body as Buffer).subarray(1, 4).toString()).toBe('PNG');
  });

  it('las respuestas traen la cita (autor y texto) y los mensajes editados traen su fecha de edición', async () => {
    const ana = await as(...ANA);
    const msgs = await historial(ana, C_CONTA, '?limit=50');
    const respuesta = msgs.find((m) => m.content?.startsWith('Sí, hasta el 31'));
    expect(respuesta.replyTo).toMatchObject({ authorName: 'Ana Quispe', kind: 'TEXT', text: expect.stringContaining('provisiones de vacaciones') });
    const editado = msgs.find((m) => m.editedAt);
    expect(editado.content).toContain('provisiones de vacaciones');
  });
});

describe('Responder a un mensaje', () => {
  beforeEach(async () => { await seedChat(prisma); await loadIds(); });

  it('responde a un mensaje de la conversación y la cita llega a todos con el autor original', async () => {
    const ana = await as(...ANA); const luis = await as(...LUIS);
    const conv = await grupoNuevo(ana);
    const original = (await enviar(ana, conv, { content: 'Necesito el reporte de ventas' })).body;
    const r = await enviar(luis, conv, { content: 'Te lo envío mañana', replyToId: original.id });
    expect(r.status).toBe(201);
    expect(r.body.replyTo).toMatchObject({ id: original.id, authorName: 'Ana Quispe', text: 'Necesito el reporte de ventas', kind: 'TEXT' });
    const vistoPorMarta = (await historial(await as(...MARTA), conv)).at(-1);
    expect(vistoPorMarta.replyTo.text).toBe('Necesito el reporte de ventas');
  });

  it('citar una foto o un documento muestra «Foto» / «Documento» y el tipo', async () => {
    const ana = await as(...ANA); const luis = await as(...LUIS);
    const conv = await grupoNuevo(ana);
    const { body: { id: imageId } } = await subir(ana, conv, png());
    const conFoto = (await enviar(ana, conv, { imageIds: [imageId] })).body;
    const r = await enviar(luis, conv, { content: 'Linda foto', replyToId: conFoto.id });
    expect(r.body.replyTo).toMatchObject({ text: 'Foto', kind: 'IMAGE' });
  });

  it('NO se puede citar un mensaje de otra conversación ni uno inexistente (no se filtra texto ajeno)', async () => {
    const ana = await as(...ANA);
    const conv = await grupoNuevo(ana);
    const ajeno = (await prisma.message.findFirstOrThrow({ where: { conversationId: DEMO_CONVERSATIONS.find((c) => c.members.join() === 'luis,pablo')!.id } })).id;
    expect((await enviar(ana, conv, { content: 'x', replyToId: ajeno })).status).toBe(400);
    expect((await enviar(ana, conv, { content: 'x', replyToId: '11111111-1111-4111-8111-111111111111' })).status).toBe(400);
    expect((await enviar(ana, conv, { content: 'x', replyToId: 'no-uuid' })).status).toBe(400);
  });
});

describe('Editar: solo los últimos 3 mensajes propios', () => {
  beforeEach(async () => { await seedChat(prisma); await loadIds(); });
  const editar = (a: Agent, conv: string, id: string, content: unknown) => a.patch(`${API}/conversations/${conv}/messages/${id}`).set(XRW).send({ content });

  async function cincoMensajes() {
    const ana = await as(...ANA);
    const conv = await grupoNuevo(ana);
    const msgs: string[] = [];
    for (let i = 1; i <= 5; i++) msgs.push((await enviar(ana, conv, { content: `mensaje ${i}` })).body.id);
    return { ana, conv, msgs };
  }

  it('edita el 3.º más reciente: cambia el texto, marca la fecha de edición y los demás lo ven editado', async () => {
    const { ana, conv, msgs } = await cincoMensajes();
    const r = await editar(ana, conv, msgs[2], 'mensaje 3 corregido');
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ id: msgs[2], content: 'mensaje 3 corregido' });
    expect(Date.parse(r.body.editedAt)).toBeGreaterThan(Date.parse(r.body.createdAt));
    const luisVe = (await historial(await as(...LUIS), conv)).find((m) => m.id === msgs[2]);
    expect(luisVe).toMatchObject({ content: 'mensaje 3 corregido', editedAt: r.body.editedAt });
    expect(luisVe.receipts).toBeUndefined();
  });

  it('el 4.º y el 5.º más viejos son inmutables (403) y el texto no cambia', async () => {
    const { ana, conv, msgs } = await cincoMensajes();
    for (const id of [msgs[1], msgs[0]]) {
      const r = await editar(ana, conv, id, 'tarde');
      expect(r.status).toBe(403);
      expect(r.body.message).toMatch(/últimos 3/);
    }
    expect((await historial(ana, conv)).find((m) => m.id === msgs[0]).content).toBe('mensaje 1');
  });

  it('nadie edita mensajes ajenos, ni siendo miembro; un ajeno al chat tampoco', async () => {
    const { conv, msgs } = await cincoMensajes();
    const luis = await as(...LUIS); const pablo = await as('pablo@empresa.com', 'Demo#Iris2026');
    expect((await editar(luis, conv, msgs[4], 'hackeado')).status).toBe(403);
    expect((await editar(pablo, conv, msgs[4], 'hackeado')).status).toBe(403);
  });

  it('guarda cada versión anterior (historial de ediciones) con su fecha; la trazabilidad la ve su autor', async () => {
    const { ana, conv, msgs } = await cincoMensajes();
    await editar(ana, conv, msgs[4], 'v2');
    await editar(ana, conv, msgs[4], 'v3');
    const filas = await prisma.messageEdit.findMany({ where: { messageId: msgs[4] }, orderBy: { editedAt: 'asc' } });
    expect(filas.map((f) => f.previousContent)).toEqual(['mensaje 5', 'v2']);
    const t = (await ana.get(`${API}/conversations/${conv}/messages/${msgs[4]}/trace`)).body;
    expect(t.edits.map((e: { previousContent: string }) => e.previousContent)).toEqual(['mensaje 5', 'v2']);
    expect(t.edits.every((e: { at: string }) => !Number.isNaN(Date.parse(e.at)))).toBe(true);
  });

  it('un mensaje nuevo desplaza la ventana: el que era el 3.º ya no se puede editar', async () => {
    const { ana, conv, msgs } = await cincoMensajes();
    await enviar(ana, conv, { content: 'mensaje 6' });
    expect((await editar(ana, conv, msgs[2], 'tarde')).status).toBe(403);
    expect((await editar(ana, conv, msgs[3], 'aún sí')).status).toBe(200);
  });

  it('validaciones: vacío, demasiado largo, sin cambios, tipo incorrecto, ids inválidos y exige CSRF/sesión', async () => {
    const { ana, conv, msgs } = await cincoMensajes();
    expect((await editar(ana, conv, msgs[4], '   ')).status).toBe(400);
    expect((await editar(ana, conv, msgs[4], 'x'.repeat(4001))).status).toBe(400);
    expect((await editar(ana, conv, msgs[4], 'mensaje 5')).status).toBe(400);
    expect((await editar(ana, conv, msgs[4], { $ne: 1 })).status).toBe(400);
    expect((await ana.patch(`${API}/conversations/${conv}/messages/no-uuid`).set(XRW).send({ content: 'x' })).status).toBe(400);
    expect((await ana.patch(`${API}/conversations/${conv}/messages/${msgs[4]}`).send({ content: 'sin cabecera' })).status).toBe(403);
    expect((await request(app.getHttpServer()).patch(`${API}/conversations/${conv}/messages/${msgs[4]}`).set(XRW).send({ content: 'x' })).status).toBe(401);
  });

  it('un mensaje con foto puede dejarse sin texto (queda solo la foto), uno solo-texto no', async () => {
    const ana = await as(...ANA);
    const conv = await grupoNuevo(ana);
    const { body: { id: imageId } } = await subir(ana, conv, png());
    const conFoto = (await enviar(ana, conv, { content: 'leyenda', imageIds: [imageId] })).body;
    const r = await editar(ana, conv, conFoto.id, '   ');
    expect(r.status).toBe(200);
    expect(r.body.images).toHaveLength(1);
  });
});

describe('Imágenes del chat', () => {
  beforeEach(async () => { await seedChat(prisma); await loadIds(); });

  it('sube, envía y los demás la ven; las medidas y el tipo salen del contenido', async () => {
    const ana = await as(...ANA); const luis = await as(...LUIS);
    const conv = await grupoNuevo(ana);
    const up = await subir(ana, conv, png(120, 80), 'C:\\fotos\\mi foto.PNG');
    expect(up.status).toBe(201);
    expect(up.body).toMatchObject({ mimeType: 'image/png', width: 120, height: 80, fileName: 'mi foto.PNG' });
    const m = await enviar(ana, conv, { content: 'mira', imageIds: [up.body.id] });
    expect(m.status).toBe(201);
    expect(m.body.images).toEqual([up.body]);
    const visto = await luis.get(`${API}/conversations/${conv}/images/${up.body.id}`);
    expect(visto.status).toBe(200);
  });

  it('rechaza lo que no es una imagen aunque lo disfracen de .png: SVG, HTML y texto', async () => {
    const ana = await as(...ANA);
    const conv = await grupoNuevo(ana);
    for (const falso of [Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"/>'), Buffer.from('<script>alert(1)</script>'), Buffer.from('MZ' + 'x'.repeat(200))]) {
      expect((await subir(ana, conv, falso, 'inocente.png')).status).toBe(400);
    }
    expect(await prisma.messageImage.count()).toBe(DEMO_CONVERSATIONS.flatMap((c) => c.messages).reduce((n, m) => n + (m.imgs?.length ?? 0), 0));
  });

  it('el tope de 5 MB se aplica mientras llega el archivo', async () => {
    const ana = await as(...ANA);
    const conv = await grupoNuevo(ana);
    const enorme = Buffer.concat([png(), Buffer.alloc(5 * 1024 * 1024 + 10)]);
    expect([400, 413]).toContain((await subir(ana, conv, enorme)).status);
  });

  it('una subida sin enviar solo la ve quien la subió; un no miembro no ve nada', async () => {
    const ana = await as(...ANA); const luis = await as(...LUIS); const pablo = await as('pablo@empresa.com', 'Demo#Iris2026');
    const conv = await grupoNuevo(ana);
    const { body: { id } } = await subir(ana, conv, png());
    expect((await ana.get(`${API}/conversations/${conv}/images/${id}`)).status).toBe(200);
    expect((await luis.get(`${API}/conversations/${conv}/images/${id}`)).status).toBe(404);
    expect((await pablo.get(`${API}/conversations/${conv}/images/${id}`)).status).toBe(403);
    expect((await pablo.post(`${API}/conversations/${conv}/images`).set(XRW).attach('file', png(), 'x.png')).status).toBe(403);
  });

  it('una imagen no se puede usar en otra conversación, ajena, ni dos veces', async () => {
    const ana = await as(...ANA); const luis = await as(...LUIS);
    const a = await grupoNuevo(ana, 'Grupo A'); const b = await grupoNuevo(ana, 'Grupo B');
    const { body: { id } } = await subir(ana, a, png());
    expect((await enviar(ana, b, { imageIds: [id] })).status).toBe(400); // otra conversación
    expect((await enviar(luis, a, { imageIds: [id] })).status).toBe(400); // la subió Ana, no Luis
    expect((await enviar(ana, a, { imageIds: [id] })).status).toBe(201);
    expect((await enviar(ana, a, { imageIds: [id] })).status).toBe(400); // ya usada
    expect((await luis.get(`${API}/conversations/${b}/images/${id}`)).status).toBe(404); // no existe en B
  });

  it('máximo 10 imágenes por mensaje; sin repetidas; ids inválidos', async () => {
    const ana = await as(...ANA);
    const conv = await grupoNuevo(ana);
    const idsImg: string[] = [];
    for (let i = 0; i < 11; i++) idsImg.push((await subir(ana, conv, png(10 + i, 10))).body.id);
    expect((await enviar(ana, conv, { imageIds: idsImg })).status).toBe(400);
    expect((await enviar(ana, conv, { imageIds: [idsImg[0], idsImg[0]] })).status).toBe(400);
    expect((await enviar(ana, conv, { imageIds: ['x'] })).status).toBe(400);
    expect((await enviar(ana, conv, { imageIds: idsImg.slice(0, 10) })).status).toBe(201);
  });

  it('exige sesión y la cabecera anti-CSRF para subir', async () => {
    const ana = await as(...ANA);
    const conv = await grupoNuevo(ana);
    expect((await ana.post(`${API}/conversations/${conv}/images`).attach('file', png(), 'x.png')).status).toBe(403);
    expect((await request(app.getHttpServer()).get(`${API}/conversations/${conv}/images/11111111-1111-4111-8111-111111111111`)).status).toBe(401);
  });
});

describe('Entregado y leído, con fecha y hora', () => {
  beforeEach(async () => { await seedChat(prisma); await loadIds(); });
  const trace = async (a: Agent, conv: string, id: string) => (await a.get(`${API}/conversations/${conv}/messages/${id}/trace`));

  it('al enviar, quien envía ve un acuse PENDIENTE por destinatario; los demás no ven acuses', async () => {
    const ana = await as(...ANA); const luis = await as(...LUIS);
    const conv = await grupoNuevo(ana);
    const m = (await enviar(ana, conv, { content: 'hola' })).body;
    expect(m.receipts.map((r: { userName: string }) => r.userName)).toEqual(['Luis Rojas', 'Marta Rojas']);
    expect(m.receipts.every((r: { deliveredAt: unknown; readAt: unknown }) => r.deliveredAt === null && r.readAt === null)).toBe(true);
    expect((await historial(luis, conv)).at(-1).receipts).toBeUndefined();
  });

  it('«entregado» se registra al conectarse el destinatario (con su hora) y NO equivale a leído', async () => {
    const ana = await as(...ANA);
    const conv = await grupoNuevo(ana);
    const m = (await enviar(ana, conv, { content: 'hola' })).body;
    await app.get(RecordDeliveryUseCase).onConnect(ids['luis@empresa.com']);
    const r = (await historial(ana, conv)).at(-1).receipts;
    const luis = r.find((x: { userName: string }) => x.userName === 'Luis Rojas');
    const marta = r.find((x: { userName: string }) => x.userName === 'Marta Rojas');
    expect(Date.parse(luis.deliveredAt)).toBeGreaterThanOrEqual(Date.parse(m.createdAt));
    expect(luis.readAt).toBeNull();
    expect(marta.deliveredAt).toBeNull(); // Marta no se conectó
  });

  it('abrir la conversación registra «leído» (y «entregado» si faltaba) solo para quien la abre', async () => {
    const ana = await as(...ANA); const luis = await as(...LUIS);
    const conv = await grupoNuevo(ana);
    await enviar(ana, conv, { content: 'hola' });
    await historial(luis, conv); // Luis abre
    const t = (await trace(ana, conv, (await historial(ana, conv)).at(-1).id)).body;
    const l = t.receipts.find((x: { userName: string }) => x.userName === 'Luis Rojas');
    const m = t.receipts.find((x: { userName: string }) => x.userName === 'Marta Rojas');
    expect(l.deliveredAt).not.toBeNull();
    expect(Date.parse(l.readAt)).toBeGreaterThanOrEqual(Date.parse(l.deliveredAt));
    expect(m).toMatchObject({ deliveredAt: null, readAt: null });
    expect(t.status).toBe('SENT'); // falta Marta
  });

  it('cuando todos lo leen, el estado pasa a LEÍDO; con la entrega de todos, a ENTREGADO', async () => {
    const ana = await as(...ANA); const luis = await as(...LUIS); const marta = await as(...MARTA);
    const conv = await grupoNuevo(ana);
    const id = (await enviar(ana, conv, { content: 'hola' })).body.id;
    await app.get(RecordDeliveryUseCase).onConnect(ids['luis@empresa.com']);
    await app.get(RecordDeliveryUseCase).onConnect(ids['marta@empresa.com']);
    expect((await trace(ana, conv, id)).body.status).toBe('DELIVERED');
    await historial(luis, conv);
    expect((await trace(ana, conv, id)).body.status).toBe('DELIVERED');
    await historial(marta, conv);
    expect((await trace(ana, conv, id)).body.status).toBe('READ');
  });

  it('INMUTABLE: la primera hora de entrega y de lectura queda fija aunque se repita la acción', async () => {
    const ana = await as(...ANA); const luis = await as(...LUIS);
    const conv = await grupoNuevo(ana);
    const id = (await enviar(ana, conv, { content: 'hola' })).body.id;
    await app.get(RecordDeliveryUseCase).onConnect(ids['luis@empresa.com']);
    await historial(luis, conv);
    const antes = (await trace(ana, conv, id)).body.receipts.find((x: { userName: string }) => x.userName === 'Luis Rojas');
    await new Promise((r) => setTimeout(r, 30));
    await app.get(RecordDeliveryUseCase).onConnect(ids['luis@empresa.com']);
    await historial(luis, conv);
    await luis.post(`${API}/conversations/${conv}/read`).set(XRW);
    const despues = (await trace(ana, conv, id)).body.receipts.find((x: { userName: string }) => x.userName === 'Luis Rojas');
    expect(despues).toEqual(antes);
  });

  it('solo el autor ve la trazabilidad: otros miembros 403, ajenos al chat 403, mensaje de otro chat 404', async () => {
    const ana = await as(...ANA); const luis = await as(...LUIS); const pablo = await as('pablo@empresa.com', 'Demo#Iris2026');
    const conv = await grupoNuevo(ana);
    const id = (await enviar(ana, conv, { content: 'hola' })).body.id;
    expect((await trace(luis, conv, id)).status).toBe(403);
    expect((await trace(pablo, conv, id)).status).toBe(403);
    expect((await trace(ana, C_CONTA, id)).status).toBe(404);
    expect((await ana.get(`${API}/conversations/${conv}/messages/no-uuid/trace`)).status).toBe(400);
  });

  it('el seed muestra estados mixtos con horas reales: Elena leyó, Carlos recibió, Jorge aún no', async () => {
    const ana = await as(...ANA);
    const m = (await historial(ana, C_AUDIT)).at(-1);
    expect(m.content).toContain('comentarios al plan');
    const por = Object.fromEntries(m.receipts.map((r: { userName: string }) => [r.userName.split(' ')[0], r]));
    expect(por.Elena.readAt).not.toBeNull();
    expect(por.Carlos.deliveredAt).not.toBeNull();
    expect(por.Carlos.readAt).toBeNull();
    expect(por.Jorge).toMatchObject({ deliveredAt: null, readAt: null });
    expect((await trace(ana, C_AUDIT, m.id)).body.status).toBe('SENT');
  });

  it('los mensajes de la conversación abierta quedan leídos de verdad: Ana abre Contabilidad y sus acuses de Marta se llenan', async () => {
    const ana = await as(...ANA); const marta = await as(...MARTA);
    const antes = (await historial(marta, C_CONTA, '?limit=50')).filter((m) => m.authorId === ids['marta@empresa.com']);
    expect(antes.length).toBeGreaterThan(0);
    const receptoresAna = (m: any) => m.receipts.find((r: { userName: string }) => r.userName === 'Ana Quispe'); // eslint-disable-line @typescript-eslint/no-explicit-any
    const sinLeer = antes.filter((m) => receptoresAna(m).readAt === null).length;
    expect(sinLeer).toBeGreaterThan(0); // Ana tenía 5 sin leer en Contabilidad
    await historial(ana, C_CONTA); // Ana abre
    const despues = (await historial(marta, C_CONTA, '?limit=50')).filter((m) => m.authorId === ids['marta@empresa.com']);
    expect(despues.every((m) => receptoresAna(m).readAt !== null)).toBe(true);
  });
});
