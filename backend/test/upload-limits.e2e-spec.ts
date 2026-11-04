import { INestApplication } from '@nestjs/common';
import { createApp, loggedInUser, prisma, resetDb, XRW } from './helpers';

const API = '/api/v1';
const DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
let app: INestApplication;
let previo: string | undefined;

beforeAll(async () => { previo = process.env.MAX_FILE_SIZE_MB; process.env.MAX_FILE_SIZE_MB = '1'; app = await createApp(); });
afterAll(async () => {
  if (previo === undefined) delete process.env.MAX_FILE_SIZE_MB; else process.env.MAX_FILE_SIZE_MB = previo;
  await app.close(); await prisma.$disconnect();
});
beforeEach(resetDb);

describe('Tope de tamaño de subida (se corta al recibir, no después de cargarlo en memoria)', () => {
  it('un archivo mayor al máximo se rechaza con 413 y no deja nada guardado', async () => {
    const { agent } = await loggedInUser(app, 'ana@empresa.com');
    const res = await agent.post(`${API}/documents`).set(XRW).field('codigo', 'GRANDE-1')
      .attach('file', Buffer.alloc(2 * 1024 * 1024, 1), { filename: 'enorme.docx', contentType: DOCX });
    expect(res.status).toBe(413);
    expect(await prisma.document.count()).toBe(0);
  });

  it('uno dentro del máximo se acepta', async () => {
    const { agent } = await loggedInUser(app, 'ana@empresa.com');
    const res = await agent.post(`${API}/documents`).set(XRW).field('codigo', 'OK-1')
      .attach('file', Buffer.alloc(200 * 1024, 1), { filename: 'normal.docx', contentType: DOCX });
    expect(res.status).toBe(201);
  });

  it('dos archivos en la misma petición se rechazan (solo se admite uno)', async () => {
    const { agent } = await loggedInUser(app, 'ana@empresa.com');
    const res = await agent.post(`${API}/documents`).set(XRW).field('codigo', 'DOS-1')
      .attach('file', Buffer.from('a'), { filename: 'a.docx', contentType: DOCX })
      .attach('file', Buffer.from('b'), { filename: 'b.docx', contentType: DOCX });
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).toBeLessThan(500);
  });
});
