import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { MAILER } from '../src/modules/mail/mail.public-api';
import { FakeMailer } from '../src/modules/auth/testing/fakes';
import { createApp, createUser, loggedInUser, login, PASSWORD, prisma, resetDb, trustDevice, UA, XRW } from './helpers';

const API = '/api/v1';
const NUEVA = 'Otra-Clave-Muy-Segura-9';
const mailer = new FakeMailer();
let app: INestApplication;

beforeAll(async () => { app = await createApp((b) => b.overrideProvider(MAILER).useValue(mailer)); });
afterAll(async () => { await app.close(); await prisma.$disconnect(); });
beforeEach(async () => { await resetDb(); mailer.sent = []; mailer.enabled = true; mailer.fail = false; });

const post = (path: string, body: object) => request(app.getHttpServer()).post(`${API}${path}`).set(XRW).set('User-Agent', UA).send(body);
const ask = (email: string) => post('/auth/password-reset/request', { email });
const confirm = (email: string, code: string, newPassword = NUEVA) => post('/auth/password-reset/confirm', { email, code, newPassword });
/** El envío del correo es asíncrono a propósito: se espera un instante a que el fake lo registre. */
const codeFor = async (email: string) => { await new Promise((r) => setTimeout(r, 30)); return mailer.lastCode(email); };

describe('GET /auth/config', () => {
  it('informa si la recuperación está disponible según el correo', async () => {
    expect((await request(app.getHttpServer()).get(`${API}/auth/config`)).body.passwordReset).toEqual({ enabled: true });
  });
});

describe('Pedir el código', () => {
  it('responde 202 con el MISMO cuerpo para un correo real y uno inexistente (no revela cuentas)', async () => {
    await createUser('ana@empresa.com');
    const real = await ask('ana@empresa.com');
    const fantasma = await ask('fantasma@empresa.com');
    expect(real.status).toBe(202);
    expect(fantasma.status).toBe(202);
    expect(fantasma.body).toEqual(real.body);
    expect(mailer.sent.map((m) => m.to)).toEqual(['ana@empresa.com']); // solo el real recibe correo
  });

  it('guarda solo el HMAC del código y deja constancia sin el código en la bitácora', async () => {
    const user = await createUser('ana@empresa.com');
    await ask('ana@empresa.com');
    const code = (await codeFor('ana@empresa.com'))!;
    const row = await prisma.passwordResetCode.findUnique({ where: { userId: user.id } });
    expect(row!.codeHash).toMatch(/^[0-9a-f]{64}$/);
    expect(row!.codeHash).not.toContain(code);
    const ev = await prisma.securityEvent.findMany({ where: { type: { startsWith: 'PASSWORD_RESET' } } });
    expect(ev.map((e) => e.type)).toContain('PASSWORD_RESET_REQUESTED');
    expect(JSON.stringify(ev)).not.toContain(code);
  });

  it('antes de 60 s no reenvía, pero responde igual', async () => {
    await createUser('ana@empresa.com');
    await ask('ana@empresa.com');
    expect((await ask('ana@empresa.com')).status).toBe(202);
    expect(mailer.sent).toHaveLength(1);
  });

  it('no envía a cuentas deshabilitadas', async () => {
    await createUser('ana@empresa.com', { status: 'DISABLED' });
    expect((await ask('ana@empresa.com')).status).toBe(202);
    expect(mailer.sent).toHaveLength(0);
  });

  it('valida la entrada (correo mal formado, campos extra) y exige la cabecera anti-CSRF', async () => {
    expect((await ask('no-es-correo')).status).toBe(400);
    expect((await post('/auth/password-reset/request', { email: 'a@b.com', rol: 'ADMIN' })).status).toBe(400);
    expect((await request(app.getHttpServer()).post(`${API}/auth/password-reset/request`).send({ email: 'a@b.com' })).status).toBe(403);
  });

  it('con el correo apagado → 403 PASSWORD_RESET_DISABLED', async () => {
    mailer.enabled = false;
    const res = await ask('ana@empresa.com');
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('PASSWORD_RESET_DISABLED');
  });
});

describe('Confirmar con el código', () => {
  it('flujo completo: la contraseña nueva sirve, la vieja no, y el aviso de cambio llega por correo', async () => {
    const user = await createUser('ana@empresa.com');
    const { key } = await trustDevice(user.id);
    await ask('ana@empresa.com');
    const code = (await codeFor('ana@empresa.com'))!;
    expect((await confirm('ana@empresa.com', code)).status).toBe(204);

    expect((await login(app, 'ana@empresa.com', NUEVA, key)).res.status).toBe(200);
    expect((await login(app, 'ana@empresa.com', PASSWORD, key)).res.status).toBe(401);
    await new Promise((r) => setTimeout(r, 30));
    expect(mailer.sent.at(-1)!.subject).toBe('Tu contraseña fue cambiada');
    expect(await prisma.passwordResetCode.count()).toBe(0); // el código se consumió
    expect(await prisma.securityEvent.count({ where: { type: 'PASSWORD_RESET_COMPLETED' } })).toBe(1);
  });

  it('cierra TODAS las sesiones abiertas: el access token que ya existía deja de servir', async () => {
    const { agent } = await loggedInUser(app, 'ana@empresa.com');
    expect((await agent.get(`${API}/auth/me`)).status).toBe(200);
    await ask('ana@empresa.com');
    await confirm('ana@empresa.com', (await codeFor('ana@empresa.com'))!);
    expect((await agent.get(`${API}/auth/me`)).status).toBe(401);
  });

  it('limpia el bloqueo por intentos fallidos', async () => {
    const user = await createUser('ana@empresa.com', { failedAttempts: 0, lockoutLevel: 1, lockedUntil: new Date(Date.now() + 3_600_000) });
    const { key } = await trustDevice(user.id);
    await ask('ana@empresa.com');
    await confirm('ana@empresa.com', (await codeFor('ana@empresa.com'))!);
    expect((await login(app, 'ana@empresa.com', NUEVA, key)).res.status).toBe(200);
  });

  it('recuperar la contraseña NO salta la aprobación de dispositivos: un equipo nuevo sigue pendiente', async () => {
    await createUser('ana@empresa.com');
    await ask('ana@empresa.com');
    await confirm('ana@empresa.com', (await codeFor('ana@empresa.com'))!);
    expect((await login(app, 'ana@empresa.com', NUEVA)).res.status).toBe(202);
  });

  it('el código sirve una sola vez', async () => {
    await createUser('ana@empresa.com');
    await ask('ana@empresa.com');
    const code = (await codeFor('ana@empresa.com'))!;
    expect((await confirm('ana@empresa.com', code)).status).toBe(204);
    const again = await confirm('ana@empresa.com', code, 'Una-Clave-Distinta-Mas-Larga-7');
    expect(again.status).toBe(400);
    expect(again.body.code).toBe('INVALID_RESET_CODE');
  });

  it('código incorrecto, correo inexistente y cuenta sin código dan EXACTAMENTE el mismo error', async () => {
    await createUser('ana@empresa.com');
    await ask('ana@empresa.com');
    const bueno = (await codeFor('ana@empresa.com'))!;
    const malo = bueno === '000000' ? '000001' : '000000';
    const a = await confirm('ana@empresa.com', malo);
    const b = await confirm('fantasma@empresa.com', '123456');
    expect([a.status, b.status]).toEqual([400, 400]);
    expect(b.body).toEqual(a.body);
  });

  it('al 5.º fallo el código se invalida: ni el correcto sirve y hay que pedir otro', async () => {
    const user = await createUser('ana@empresa.com');
    await ask('ana@empresa.com');
    const bueno = (await codeFor('ana@empresa.com'))!;
    const malo = bueno === '000000' ? '000001' : '000000';
    for (let i = 0; i < 5; i++) expect((await confirm('ana@empresa.com', malo)).status).toBe(400);
    expect(await prisma.passwordResetCode.count({ where: { userId: user.id } })).toBe(0);
    expect((await confirm('ana@empresa.com', bueno)).status).toBe(400);
    expect(await prisma.securityEvent.count({ where: { type: 'PASSWORD_RESET_FAILED' } })).toBe(6);
  });

  it('el código vencido no sirve', async () => {
    const user = await createUser('ana@empresa.com');
    await ask('ana@empresa.com');
    const code = (await codeFor('ana@empresa.com'))!;
    await prisma.passwordResetCode.update({ where: { userId: user.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
    expect((await confirm('ana@empresa.com', code)).status).toBe(400);
  });

  it('con el código correcto pero contraseña débil: 400 de política y el código SIGUE vigente', async () => {
    const user = await createUser('ana@empresa.com');
    await ask('ana@empresa.com');
    const code = (await codeFor('ana@empresa.com'))!;
    expect((await confirm('ana@empresa.com', code, 'corta')).status).toBe(400);
    expect((await confirm('ana@empresa.com', PASSWORD.toLowerCase().replace(/-/g, '') + 'x')).status).toBeLessThan(500);
    expect(await prisma.passwordResetCode.count({ where: { userId: user.id } })).toBe(1);
    expect((await confirm('ana@empresa.com', code)).status).toBe(204);
  });

  it('no deja volver a la contraseña actual', async () => {
    await createUser('ana@empresa.com');
    await ask('ana@empresa.com');
    const res = await confirm('ana@empresa.com', (await codeFor('ana@empresa.com'))!, PASSWORD);
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/reutilizar/);
  });

  it('dos confirmaciones simultáneas con el código correcto: solo una tiene éxito', async () => {
    await createUser('ana@empresa.com');
    await ask('ana@empresa.com');
    const code = (await codeFor('ana@empresa.com'))!;
    const [a, b] = await Promise.all([confirm('ana@empresa.com', code), confirm('ana@empresa.com', code, 'Segunda-Clave-Larga-Y-Distinta-3')]);
    expect([a.status, b.status].sort()).toEqual([204, 400]);
  });

  it('el código de una cuenta no sirve para otra', async () => {
    await createUser('ana@empresa.com');
    await createUser('luis@empresa.com');
    await ask('ana@empresa.com');
    const code = (await codeFor('ana@empresa.com'))!;
    expect((await confirm('luis@empresa.com', code)).status).toBe(400);
  });

  it('valida el formato: el código son exactamente 6 dígitos', async () => {
    for (const code of ['12345', '1234567', 'abcdef', '12 456']) expect((await confirm('ana@empresa.com', code)).status).toBe(400);
    expect((await post('/auth/password-reset/confirm', { email: 'a@b.com', code: '123456' })).status).toBe(400); // falta la contraseña
  });

  it('si Gmail falla, pedir el código sigue respondiendo 202 (no filtra el fallo) y queda en la bitácora', async () => {
    await createUser('ana@empresa.com');
    mailer.fail = true;
    expect((await ask('ana@empresa.com')).status).toBe(202);
    await new Promise((r) => setTimeout(r, 50));
    expect(await prisma.securityEvent.count({ where: { type: 'PASSWORD_RESET_MAIL_FAILED' } })).toBe(1);
  });
});
