import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createApp, loggedInUser, prisma, resetDb, XRW } from './helpers';

const API = '/api/v1';
const MISSING = '00000000-0000-0000-0000-000000000000';
let app: INestApplication;

beforeAll(async () => { app = await createApp(); });
afterAll(async () => { await app.close(); await prisma.$disconnect(); });
beforeEach(resetDb);

let seq = 0;
const upload = (agent: request.Agent, content = 'contenido secreto del contrato', code = `DOC-${++seq}`) =>
  agent.post(`${API}/documents`).set(XRW).field('codigo', code).field('nombreDocumento', 'Contrato')
    .attach('file', Buffer.from(content), { filename: 'contrato.txt', contentType: 'text/plain' });

async function twoUsers() {
  const ana = await loggedInUser(app, 'ana@empresa.com');
  const luis = await loggedInUser(app, 'luis@empresa.com');
  const doc = (await upload(ana.agent)).body.document;
  return { ana, luis, doc };
}

describe('Archivos: todo exige sesión', () => {
  it.each([
    ['POST', '/documents'],
    ['GET', `/documents/${MISSING}/download`],
    ['GET', `/documents/${MISSING}/history`],
    ['POST', `/documents/${MISSING}/versions`],
    ['POST', `/documents/${MISSING}/reviews`],
  ])('%s %s sin sesión → 401', async (method, path) => {
    const res = await request(app.getHttpServer())[method.toLowerCase() as 'get' | 'post'](`${API}${path}`).set(XRW);
    expect(res.status).toBe(401);
  });
});

describe('Archivos: lo ajeno no existe', () => {
  it('el dueño sube y descarga su documento (contenido íntegro)', async () => {
    const { ana, doc } = await twoUsers();
    const res = await ana.agent.get(`${API}/documents/${doc.id}/download`).buffer(true).parse((r, cb) => {
      const chunks: Buffer[] = []; r.on('data', (c) => chunks.push(c)); r.on('end', () => cb(null, Buffer.concat(chunks)));
    });
    expect(res.status).toBe(200);
    expect(res.headers['content-disposition']).toMatch(/attachment/);
    expect((res.body as Buffer).toString()).toBe('contenido secreto del contrato');
  });

  it('otro usuario sin permiso recibe 404 al descargar, ver historial, subir versión o pedir revisión', async () => {
    const { luis, doc } = await twoUsers();
    const attempts = [
      luis.agent.get(`${API}/documents/${doc.id}/download`),
      luis.agent.get(`${API}/documents/${doc.id}/history`),
      luis.agent.post(`${API}/documents/${doc.id}/versions`).set(XRW)
        .attach('file', Buffer.from('x'), { filename: 'x.txt', contentType: 'text/plain' }),
      luis.agent.post(`${API}/documents/${doc.id}/reviews`).set(XRW).send({ reviewerId: luis.user.id }),
    ];
    for (const res of await Promise.all(attempts)) expect(res.status).toBe(404);
  });

  it('un documento ajeno es INDISTINGUIBLE de uno que no existe (misma respuesta)', async () => {
    const { luis, doc } = await twoUsers();
    const foreign = await luis.agent.get(`${API}/documents/${doc.id}/download`);
    const missing = await luis.agent.get(`${API}/documents/${MISSING}/download`);
    expect(foreign.status).toBe(missing.status);
    expect(foreign.body).toEqual(missing.body);
  });

  it('el intento ajeno NO deja una descarga registrada', async () => {
    const { luis, doc } = await twoUsers();
    await luis.agent.get(`${API}/documents/${doc.id}/download`);
    expect(await prisma.documentAccessLog.count({ where: { action: 'DESCARGAR' } })).toBe(0);
  });

  it('con permiso DESCARGAR puede descargar, pero ya no es 404: ver historial o editar da 403', async () => {
    const { ana, luis, doc } = await twoUsers();
    await ana.agent.post(`${API}/documents/${doc.id}/reviews`).set(XRW).send({ reviewerId: luis.user.id }); // da DESCARGAR al revisor
    expect((await luis.agent.get(`${API}/documents/${doc.id}/download`)).status).toBe(200);
    expect((await luis.agent.get(`${API}/documents/${doc.id}/history`)).status).toBe(403);
    const edit = await luis.agent.post(`${API}/documents/${doc.id}/versions`).set(XRW)
      .attach('file', Buffer.from('x'), { filename: 'x.txt', contentType: 'text/plain' });
    expect(edit.status).toBe(403);
  });

  it('solo el revisor asignado puede decidir la revisión', async () => {
    const { ana, luis, doc } = await twoUsers();
    const review = (await ana.agent.post(`${API}/documents/${doc.id}/reviews`).set(XRW).send({ reviewerId: luis.user.id })).body;
    const byOwner = await ana.agent.patch(`${API}/reviews/${review.id}`).set(XRW).send({ decision: 'APROBADO' });
    expect(byOwner.status).toBe(403);
    const byReviewer = await luis.agent.patch(`${API}/reviews/${review.id}`).set(XRW).send({ decision: 'APROBADO' });
    expect(byReviewer.status).toBe(200);
    expect((await prisma.document.findUnique({ where: { id: doc.id } }))!.estado).toBe('APROBADO');
  });
});

describe('Archivos: revisiones y trazabilidad', () => {
  it('cada subida es una versión nueva; la anterior se conserva con su hash', async () => {
    const { ana, doc } = await twoUsers();
    const v2 = await ana.agent.post(`${API}/documents/${doc.id}/versions`).set(XRW).field('changeNote', 'corrección')
      .attach('file', Buffer.from('versión dos'), { filename: 'contrato.txt', contentType: 'text/plain' });
    expect(v2.status).toBe(201);
    const versions = await prisma.documentVersion.findMany({ where: { documentId: doc.id }, orderBy: { versionNumber: 'asc' } });
    expect(versions.map((v) => v.versionNumber)).toEqual([1, 2]);
    expect(versions[0].checksumSha256).not.toBe(versions[1].checksumSha256);
    expect(versions[1].changeNote).toBe('corrección');
  });

  it('descargar deja registro: quién, qué versión, IP y user-agent', async () => {
    const { ana, doc } = await twoUsers();
    await ana.agent.get(`${API}/documents/${doc.id}/download`).set('User-Agent', 'MiNavegador/1.0');
    const log = await prisma.documentAccessLog.findFirst({ where: { action: 'DESCARGAR' } });
    expect(log).toMatchObject({ documentId: doc.id, userId: ana.user.id, userAgent: 'MiNavegador/1.0' });
    expect(log!.ip).toBeTruthy();
    expect(log!.versionId).toBeTruthy();
  });

  it('el historial del dueño muestra subida, descargas y compartidos en orden', async () => {
    const { ana, luis, doc } = await twoUsers();
    await ana.agent.post(`${API}/documents/${doc.id}/reviews`).set(XRW).send({ reviewerId: luis.user.id });
    await luis.agent.get(`${API}/documents/${doc.id}/download`);
    const history = (await ana.agent.get(`${API}/documents/${doc.id}/history`)).body as Array<{ action: string; userId: string }>;
    const actions = history.map((h) => h.action);
    expect(actions).toEqual(expect.arrayContaining(['SUBIR', 'REVISION_SOLICITADA', 'DESCARGAR']));
    expect(history.find((h) => h.action === 'DESCARGAR')!.userId).toBe(luis.user.id);
  });

  it('rechaza tipos de archivo no permitidos', async () => {
    const { ana } = await twoUsers();
    const res = await ana.agent.post(`${API}/documents`).set(XRW).field('codigo', 'MAL-1')
      .attach('file', Buffer.from('MZ...'), { filename: 'virus.exe', contentType: 'application/x-msdownload' });
    expect(res.status).toBe(400);
  });

  it('rechaza archivos vacíos', async () => {
    const { ana } = await twoUsers();
    const res = await ana.agent.post(`${API}/documents`).set(XRW).field('codigo', 'VAC-1')
      .attach('file', Buffer.alloc(0), { filename: 'vacio.txt', contentType: 'text/plain' });
    expect(res.status).toBe(400);
  });
});
