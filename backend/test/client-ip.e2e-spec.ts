import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createApp, createUser, loggedInUser, prisma, resetDb, PASSWORD, UA, XRW } from './helpers';

const API = '/api/v1';
const REAL = '203.0.113.7';

async function loginFrom(app: INestApplication, headers: Record<string, string> = {}) {
  return request(app.getHttpServer()).post(`${API}/auth/login`).set(XRW).set('User-Agent', UA).set(headers)
    .send({ email: 'ana@empresa.com', password: PASSWORD });
}

afterAll(async () => { await prisma.$disconnect(); });
beforeEach(resetDb);

describe('IP real del dispositivo', () => {
  it('detrás de un proxy de confianza (TRUST_PROXY=1) se registra la IP del navegador, no la del proxy', async () => {
    process.env.TRUST_PROXY = '1';
    const app = await createApp();
    try {
      await createUser('ana@empresa.com');
      await loginFrom(app, { 'X-Forwarded-For': REAL });
      const d = await prisma.device.findFirstOrThrow();
      expect(d.firstIp).toBe(REAL);
      expect(d.lastIp).toBe(REAL);
    } finally { await app.close(); process.env.TRUST_PROXY = ''; }
  });

  it('con varios saltos solo se confía en el último proxy: una IP falsa que mande el cliente se ignora', async () => {
    process.env.TRUST_PROXY = '1';
    const app = await createApp();
    try {
      await createUser('ana@empresa.com');
      // el cliente intenta fingir 10.9.9.9; el proxy de confianza agrega la IP real al final
      await loginFrom(app, { 'X-Forwarded-For': `10.9.9.9, ${REAL}` });
      expect((await prisma.device.findFirstOrThrow()).lastIp).toBe(REAL);
    } finally { await app.close(); process.env.TRUST_PROXY = ''; }
  });

  it('sin TRUST_PROXY la cabecera X-Forwarded-For se ignora (no se puede falsear la IP)', async () => {
    process.env.TRUST_PROXY = '';
    const app = await createApp();
    try {
      await createUser('ana@empresa.com');
      await loginFrom(app, { 'X-Forwarded-For': REAL });
      const ip = (await prisma.device.findFirstOrThrow()).lastIp;
      expect(ip).not.toBe(REAL);
      expect(ip).toBe('127.0.0.1'); // loopback normalizado, no "::1" ni "::ffff:127.0.0.1"
    } finally { await app.close(); }
  });

  it('el panel de dispositivos distingue dos equipos del mismo usuario por IP y por código', async () => {
    process.env.TRUST_PROXY = '1';
    const app = await createApp();
    try {
      await createUser('ana@empresa.com');
      const { agent } = await loggedInUser(app, 'admin@empresa.com', { roles: ['ADMIN'] });
      await loginFrom(app, { 'X-Forwarded-For': '198.51.100.20' }); // equipo 1
      await loginFrom(app, { 'X-Forwarded-For': '203.0.113.99' });  // equipo 2 (otro navegador, sin cookie de dispositivo)

      const rows = (await agent.get(`${API}/admin/devices`)).body.filter((d: any) => d.email === 'ana@empresa.com');
      expect(rows.map((d: any) => d.ip).sort()).toEqual(['198.51.100.20', '203.0.113.99']);
      expect(rows.every((d: any) => d.firstIp === d.ip)).toBe(true);
      expect(new Set(rows.map((d: any) => d.code)).size).toBe(2);
      expect(rows[0].code).toMatch(/^[0-9A-F]{8}$/);
    } finally { await app.close(); process.env.TRUST_PROXY = ''; }
  });
});
