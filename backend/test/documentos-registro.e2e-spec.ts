import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createApp, loggedInUser, prisma, resetDb, XRW } from './helpers';

const API = '/api/v1';
let app: INestApplication;

beforeAll(async () => { app = await createApp(); });
afterAll(async () => { await app.close(); await prisma.$disconnect(); });
beforeEach(resetDb);

const DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

const cargar = (agent: request.Agent, campos: Record<string, string>, archivo = { name: 'procedimiento_de_compras.docx', type: DOCX }) => {
  let req = agent.post(`${API}/documents`).set(XRW);
  for (const [k, v] of Object.entries(campos)) req = req.field(k, v);
  return req.attach('file', Buffer.from('contenido'), { filename: archivo.name, contentType: archivo.type });
};

describe('Registro maestro: carga con los campos del formulario', () => {
  it('solo con el código: el nombre sale del archivo y el sistema llena el resto', async () => {
    const ana = await loggedInUser(app, 'ana@empresa.com');
    const res = await cargar(ana.agent, { codigo: 'pr-com-001' });
    expect(res.status).toBe(201);
    const d = res.body.document;
    expect(d).toMatchObject({
      codigo: 'PR-COM-001',                         // se normaliza a mayúsculas
      nombreDocumento: 'procedimiento de compras',  // nombre del archivo sin extensión
      estado: 'BORRADOR', cambios: 'NO', version: 1,
      usuarioCreadorId: ana.user.id, usuarioModificadorId: ana.user.id, usuarioActualizadorId: ana.user.id,
    });
    expect(d.gestion).toBe(new Date().getUTCFullYear());
    expect(d.revisorId).toBeUndefined();
    expect(d.urlWord).toBe(`/documents/${d.id}/download?versionId=${res.body.version.id}`); // es un .docx
    expect(d.urlPdf).toBeUndefined();
  });

  it('el nombre puede cambiarse; la fecha de creación guarda fecha Y hora y define la gestión', async () => {
    const ana = await loggedInUser(app, 'ana@empresa.com');
    const res = await cargar(ana.agent, { codigo: 'MAN-1', nombreDocumento: 'Manual de calidad', fechaCreacion: '2024-03-15T14:35:00.000Z' });
    expect(res.status).toBe(201);
    expect(res.body.document).toMatchObject({ nombreDocumento: 'Manual de calidad', gestion: 2024 });
    expect(new Date(res.body.document.fechaCreacion).toISOString()).toBe('2024-03-15T14:35:00.000Z');
  });

  it('la gestión sigue la zona horaria de la organización (31/dic 22:00 en La Paz sigue siendo ese año)', async () => {
    const ana = await loggedInUser(app, 'ana@empresa.com');
    const res = await cargar(ana.agent, { codigo: 'ANO-1', fechaCreacion: '2025-01-01T02:00:00.000Z' });
    expect(res.body.document.gestion).toBe(2024);
  });

  it('todas las fechas de la tabla son TIMESTAMPTZ (fecha y hora con zona)', async () => {
    const cols = await prisma.$queryRawUnsafe<Array<{ column_name: string; data_type: string }>>(
      "SELECT column_name, data_type FROM information_schema.columns WHERE table_schema='public' AND table_name='documentos' AND column_name LIKE 'fecha_%'");
    expect(cols.map((c) => c.column_name).sort()).toEqual(['fecha_actualizacion', 'fecha_creacion', 'fecha_modificacion']);
    for (const c of cols) expect(c.data_type).toBe('timestamp with time zone');
  });

  it('cargarlo como REVISADO deja al usuario como revisor; borrador no tiene revisor', async () => {
    const ana = await loggedInUser(app, 'ana@empresa.com');
    const rev = await cargar(ana.agent, { codigo: 'REV-1', estado: 'REVISADO' });
    expect(rev.body.document).toMatchObject({ estado: 'REVISADO', revisorId: ana.user.id });
  });

  it('un PDF llena url_pdf y no url_word', async () => {
    const ana = await loggedInUser(app, 'ana@empresa.com');
    const res = await cargar(ana.agent, { codigo: 'PDF-1' }, { name: 'norma.pdf', type: 'application/pdf' });
    expect(res.body.document.urlPdf).toContain('/download?versionId=');
    expect(res.body.document.urlWord).toBeUndefined();
  });

  it('en la base de datos las columnas y los estados están en español sin tildes', async () => {
    const ana = await loggedInUser(app, 'ana@empresa.com');
    await cargar(ana.agent, { codigo: 'BD-1', estado: 'REVISADO' });
    const filas = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>('SELECT * FROM "documentos"');
    expect(filas).toHaveLength(1);
    expect(Object.keys(filas[0])).toEqual(expect.arrayContaining([
      'codigo', 'nombre_documento', 'fecha_creacion', 'fecha_modificacion', 'usuario_creador_id',
      'usuario_modificador_id', 'version', 'fecha_actualizacion', 'usuario_actualizador_id', 'revisor_id',
      'url_word', 'url_pdf', 'gestion', 'cambios',
    ]));
    expect(filas[0].estado).toBe('revisado');
    expect(filas[0].cambios).toBe('no');
  });
});

describe('Registro maestro: validaciones', () => {
  it.each([
    ['sin código', {}],
    ['código con espacios', { codigo: 'PR 001' }],
    ['código demasiado corto', { codigo: 'A' }],
    ['código con tilde o eñe', { codigo: 'AÑO-1' }],
    ['estado inicial inválido', { codigo: 'OK-1', estado: 'APROBADO' }],
    ['fecha futura', { codigo: 'OK-2', fechaCreacion: '2999-01-01T00:00:00Z' }],
    ['fecha mal formada', { codigo: 'OK-3', fechaCreacion: 'ayer' }],
  ])('%s → 400', async (_n, campos) => {
    const ana = await loggedInUser(app, 'ana@empresa.com');
    expect((await cargar(ana.agent, campos as Record<string, string>)).status).toBe(400);
  });

  it('un código repetido → 409 (aunque cambien las mayúsculas) y no deja archivo ni documento duplicado', async () => {
    const ana = await loggedInUser(app, 'ana@empresa.com');
    const luis = await loggedInUser(app, 'luis@empresa.com');
    expect((await cargar(ana.agent, { codigo: 'DUP-1' })).status).toBe(201);
    const otra = await cargar(luis.agent, { codigo: 'dup-1' });
    expect(otra.status).toBe(409);
    expect(await prisma.document.count()).toBe(1);
    expect(await prisma.documentVersion.count()).toBe(1);
  });
});

describe('Registro maestro: auditoría automática', () => {
  it('una nueva versión pone cambios=SI, sube version, y registra quién actualizó', async () => {
    const ana = await loggedInUser(app, 'ana@empresa.com');
    const doc = (await cargar(ana.agent, { codigo: 'ACT-1' })).body.document;
    const antes = await prisma.document.findUniqueOrThrow({ where: { id: doc.id } });

    const v2 = await ana.agent.post(`${API}/documents/${doc.id}/versions`).set(XRW)
      .attach('file', Buffer.from('v2'), { filename: 'norma.pdf', contentType: 'application/pdf' });
    expect(v2.status).toBe(201);

    const despues = await prisma.document.findUniqueOrThrow({ where: { id: doc.id } });
    expect(despues).toMatchObject({ cambios: 'SI', version: 2, usuarioActualizadorId: ana.user.id });
    expect(despues.fechaActualizacion.getTime()).toBeGreaterThanOrEqual(antes.fechaActualizacion.getTime());
    expect(despues.urlPdf).toContain(v2.body.id); // el PDF nuevo
    expect(despues.urlWord).toBe(antes.urlWord);  // el Word anterior se conserva
  });

  it('pedir y decidir una revisión actualiza estado, revisor y quién modificó', async () => {
    const ana = await loggedInUser(app, 'ana@empresa.com');
    const luis = await loggedInUser(app, 'luis@empresa.com');
    const doc = (await cargar(ana.agent, { codigo: 'REV-9' })).body.document;

    const review = (await ana.agent.post(`${API}/documents/${doc.id}/reviews`).set(XRW).send({ reviewerId: luis.user.id })).body;
    expect(await prisma.document.findUniqueOrThrow({ where: { id: doc.id } }))
      .toMatchObject({ estado: 'EN_REVISION', revisorId: luis.user.id, usuarioModificadorId: ana.user.id });

    await luis.agent.patch(`${API}/reviews/${review.id}`).set(XRW).send({ decision: 'APROBADO' });
    expect(await prisma.document.findUniqueOrThrow({ where: { id: doc.id } }))
      .toMatchObject({ estado: 'APROBADO', revisorId: luis.user.id, usuarioModificadorId: luis.user.id });
  });
});

describe('Registro maestro: listado y detalle', () => {
  it('el listado trae los campos del registro con nombres de personas y solo lo visible', async () => {
    const ana = await loggedInUser(app, 'ana@empresa.com');
    const luis = await loggedInUser(app, 'luis@empresa.com');
    await cargar(ana.agent, { codigo: 'LIS-1' });

    const deAna = (await ana.agent.get(`${API}/documents`)).body;
    expect(deAna).toHaveLength(1);
    expect(deAna[0]).toMatchObject({
      codigo: 'LIS-1', estado: 'BORRADOR', cambios: 'NO', version: 1, miPermiso: 'PROPIETARIO',
      usuarioCreador: { id: ana.user.id, nombre: 'ana' },
    });
    expect(deAna[0].versionVigente.fileName).toBe('procedimiento_de_compras.docx');

    expect((await luis.agent.get(`${API}/documents`)).body).toEqual([]); // lo ajeno no aparece
  });

  it('el detalle incluye versiones y revisiones; un ajeno recibe 404', async () => {
    const ana = await loggedInUser(app, 'ana@empresa.com');
    const luis = await loggedInUser(app, 'luis@empresa.com');
    const doc = (await cargar(ana.agent, { codigo: 'DET-1' })).body.document;
    await ana.agent.post(`${API}/documents/${doc.id}/reviews`).set(XRW).send({ reviewerId: luis.user.id });

    const det = (await ana.agent.get(`${API}/documents/${doc.id}`)).body;
    expect(det.versions).toHaveLength(1);
    expect(det.reviews[0]).toMatchObject({ reviewerName: 'luis', decision: 'PENDIENTE' });

    // el revisor ya puede verlo (le compartieron); un tercero no
    expect((await luis.agent.get(`${API}/documents/${doc.id}`)).status).toBe(200);
    const marta = await loggedInUser(app, 'marta@empresa.com');
    expect((await marta.agent.get(`${API}/documents/${doc.id}`)).status).toBe(404);
    expect((await luis.agent.get(`${API}/documents`)).body[0]).toMatchObject({ codigo: 'DET-1', miPermiso: 'DESCARGAR' });
  });
});
