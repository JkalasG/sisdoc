import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import {
  cookieNamed, cookieValue, createApp, createUser, loggedInUser, login, PASSWORD, prisma,
  resetDb, trustDevice, UA, XRW,
} from './helpers';

const API = '/api/v1';
let app: INestApplication;

beforeAll(async () => { app = await createApp(); });
afterAll(async () => { await app.close(); await prisma.$disconnect(); });
beforeEach(resetDb);

describe('Protección CSRF y cabeceras', () => {
  it('rechaza un POST sin la cabecera X-Requested-With', async () => {
    const res = await request(app.getHttpServer()).post(`${API}/auth/login`).send({ email: 'a@b.com', password: 'x' });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('CSRF');
  });

  it('rechaza un POST desde un Origin no permitido', async () => {
    const res = await request(app.getHttpServer()).post(`${API}/auth/login`).set(XRW)
      .set('Origin', 'https://sitio-malicioso.com').send({ email: 'a@b.com', password: 'x' });
    expect(res.status).toBe(403);
  });

  it('las respuestas llevan cabeceras de seguridad y no revelan el framework', async () => {
    const res = await request(app.getHttpServer()).get(`${API}/auth/me`);
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-powered-by']).toBeUndefined();
  });

  it('valida las entradas: correo mal formado y campos extra son rechazados', async () => {
    const bad = await request(app.getHttpServer()).post(`${API}/auth/login`).set(XRW).send({ email: 'no-es-correo', password: 'x' });
    expect(bad.status).toBe(400);
    const extra = await request(app.getHttpServer()).post(`${API}/auth/login`).set(XRW)
      .send({ email: 'a@b.com', password: 'x', isAdmin: true });
    expect(extra.status).toBe(400);
  });
});

describe('Inicio de sesión', () => {
  it('dispositivo nuevo → 202 pendiente, recibe cookie de dispositivo y NINGUNA de sesión', async () => {
    await createUser('ana@empresa.com');
    const { res, agent } = await login(app, 'ana@empresa.com', PASSWORD);
    expect(res.status).toBe(202);
    expect(res.body.status).toBe('DEVICE_PENDING');
    expect(cookieNamed(res, 'sisdoc_dk')).toMatch(/HttpOnly/i);
    expect(cookieNamed(res, 'sisdoc_at')).toBeUndefined();
    expect(cookieNamed(res, 'sisdoc_rt')).toBeUndefined();
    expect((await agent.get(`${API}/auth/me`)).status).toBe(401);
    expect(await prisma.device.count({ where: { status: 'PENDING' } })).toBe(1);
  });

  it('tras aprobar el dispositivo, el mismo navegador entra (flujo completo)', async () => {
    await createUser('ana@empresa.com');
    const first = await login(app, 'ana@empresa.com', PASSWORD);
    await prisma.device.updateMany({ data: { status: 'TRUSTED' } }); // el administrador lo aprueba
    const second = await login(app, 'ana@empresa.com', PASSWORD, cookieValue(first.res, 'sisdoc_dk'), first.agent);
    expect(second.res.status).toBe(200);
    expect((await first.agent.get(`${API}/auth/me`)).status).toBe(200);
  });

  it('cookies de sesión: HttpOnly, SameSite=Strict; el refresh solo viaja a /auth', async () => {
    const { loginRes } = await loggedInUser(app, 'ana@empresa.com');
    const at = cookieNamed(loginRes, 'sisdoc_at')!;
    const rt = cookieNamed(loginRes, 'sisdoc_rt')!;
    for (const c of [at, rt, cookieNamed(loginRes, 'sisdoc_dk')!]) {
      expect(c).toMatch(/HttpOnly/i);
      expect(c).toMatch(/SameSite=Strict/i);
    }
    expect(at).toMatch(/Path=\//);
    expect(rt).toMatch(/Path=\/api\/v1\/auth/);
    expect(loginRes.body.user.email).toBe('ana@empresa.com');
  });

  it('el token de acceso NO viaja en el cuerpo de la respuesta (solo en cookie)', async () => {
    const { loginRes } = await loggedInUser(app, 'ana@empresa.com');
    expect(JSON.stringify(loginRes.body)).not.toMatch(/token|jwt|eyJ/i);
  });

  it('contraseña incorrecta y correo inexistente son indistinguibles', async () => {
    await createUser('ana@empresa.com');
    const wrong = await login(app, 'ana@empresa.com', 'clave-equivocada-123');
    const unknown = await login(app, 'nadie@empresa.com', 'clave-equivocada-123');
    expect(wrong.res.status).toBe(401);
    expect(unknown.res.status).toBe(401);
    expect(unknown.res.body).toEqual(wrong.res.body);
  });

  it('5 fallos bloquean la cuenta: ni la contraseña correcta entra', async () => {
    const user = await createUser('ana@empresa.com');
    const { key } = await trustDevice(user.id);
    for (let i = 0; i < 5; i++) await login(app, 'ana@empresa.com', 'clave-equivocada-123', key);
    const { res } = await login(app, 'ana@empresa.com', PASSWORD, key);
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('INVALID_CREDENTIALS');
    expect((await prisma.user.findUnique({ where: { id: user.id } }))!.lockedUntil).not.toBeNull();
  });

  it('usuario deshabilitado no entra', async () => {
    const user = await createUser('ana@empresa.com', { status: 'DISABLED' });
    const { key } = await trustDevice(user.id);
    expect((await login(app, 'ana@empresa.com', PASSWORD, key)).res.status).toBe(401);
  });

  it('dispositivo bloqueado → 403', async () => {
    const user = await createUser('ana@empresa.com');
    const { key, device } = await trustDevice(user.id);
    await prisma.device.update({ where: { id: device.id }, data: { status: 'BLOCKED' } });
    const { res } = await login(app, 'ana@empresa.com', PASSWORD, key);
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('DEVICE_BLOCKED');
  });

  it('máximo 3 sesiones: la 4.ª se rechaza con 409', async () => {
    const user = await createUser('ana@empresa.com');
    const { key } = await trustDevice(user.id);
    for (let i = 0; i < 3; i++) expect((await login(app, 'ana@empresa.com', PASSWORD, key)).res.status).toBe(200);
    const fourth = await login(app, 'ana@empresa.com', PASSWORD, key);
    expect(fourth.res.status).toBe(409);
    expect(fourth.res.body.code).toBe('SESSION_LIMIT');
  });
});

describe('Sesión: acceso, refresh y cierre', () => {
  it('sin cookie → 401; con cookie manipulada → 401', async () => {
    expect((await request(app.getHttpServer()).get(`${API}/auth/me`)).status).toBe(401);
    const forged = await request(app.getHttpServer()).get(`${API}/auth/me`).set('Cookie', 'sisdoc_at=eyJhbGciOiJub25lIn0.e30.');
    expect(forged.status).toBe(401);
  });

  it('GET /auth/me devuelve datos públicos y jamás el hash de contraseña', async () => {
    const { agent } = await loggedInUser(app, 'ana@empresa.com');
    const me = await agent.get(`${API}/auth/me`);
    expect(me.status).toBe(200);
    expect(Object.keys(me.body).sort()).toEqual(['displayName', 'email', 'id', 'mustChangePassword']);
  });

  it('refresh emite nuevas cookies y la sesión sigue funcionando', async () => {
    const { agent, loginRes } = await loggedInUser(app, 'ana@empresa.com');
    const res = await agent.post(`${API}/auth/refresh`).set(XRW);
    expect(res.status).toBe(200);
    expect(cookieValue(res, 'sisdoc_rt')).not.toBe(cookieValue(loginRes, 'sisdoc_rt'));
    expect((await agent.get(`${API}/auth/me`)).status).toBe(200);
  });

  it('reutilizar un refresh viejo revoca la sesión: el atacante y el usuario real quedan fuera', async () => {
    const { agent, loginRes } = await loggedInUser(app, 'ana@empresa.com');
    const oldRefresh = `sisdoc_rt=${cookieValue(loginRes, 'sisdoc_rt')}`;
    await agent.post(`${API}/auth/refresh`).set(XRW); // el usuario rota legítimamente
    const attacker = await request(app.getHttpServer()).post(`${API}/auth/refresh`).set(XRW).set('Cookie', oldRefresh);
    expect(attacker.status).toBe(401);
    expect((await agent.get(`${API}/auth/me`)).status).toBe(401); // el access aún vigente también cae
    expect((await agent.post(`${API}/auth/refresh`).set(XRW)).status).toBe(401);
    expect(await prisma.securityEvent.count({ where: { type: 'REFRESH_REUSE' } })).toBe(1);
  });

  it('refresh sin cookie → 401', async () => {
    expect((await request(app.getHttpServer()).post(`${API}/auth/refresh`).set(XRW)).status).toBe(401);
  });

  it('logout revoca en el SERVIDOR: el access capturado deja de servir aunque no haya vencido', async () => {
    const { agent, loginRes } = await loggedInUser(app, 'ana@empresa.com');
    const stolenAccess = `sisdoc_at=${cookieValue(loginRes, 'sisdoc_at')}`;
    const out = await agent.post(`${API}/auth/logout`).set(XRW);
    expect(out.status).toBe(204);
    const replay = await request(app.getHttpServer()).get(`${API}/auth/me`).set('Cookie', stolenAccess);
    expect(replay.status).toBe(401);
  });

  it('logout-all cierra todas mis sesiones', async () => {
    const { agent, user, deviceKey } = await loggedInUser(app, 'ana@empresa.com');
    const other = await login(app, 'ana@empresa.com', PASSWORD, deviceKey);
    expect(other.res.status).toBe(200);
    expect((await agent.post(`${API}/auth/logout-all`).set(XRW)).status).toBe(204);
    expect((await other.agent.get(`${API}/auth/me`)).status).toBe(401);
    expect(await prisma.session.count({ where: { userId: user.id, revokedAt: null } })).toBe(0);
  });

  it('un administrador que bloquea el dispositivo expulsa al usuario en la siguiente petición', async () => {
    const { agent, device } = await loggedInUser(app, 'ana@empresa.com');
    expect((await agent.get(`${API}/auth/me`)).status).toBe(200);
    await prisma.device.update({ where: { id: device.id }, data: { status: 'BLOCKED' } });
    expect((await agent.get(`${API}/auth/me`)).status).toBe(401);
  });

  it('deshabilitar al usuario lo expulsa en la siguiente petición', async () => {
    const { agent, user } = await loggedInUser(app, 'ana@empresa.com');
    await prisma.user.update({ where: { id: user.id }, data: { status: 'DISABLED' } });
    expect((await agent.get(`${API}/auth/me`)).status).toBe(401);
  });

  it('una sesión con 30 min de inactividad deja de servir', async () => {
    const { agent, user } = await loggedInUser(app, 'ana@empresa.com');
    await prisma.session.updateMany({ where: { userId: user.id }, data: { lastActivityAt: new Date(Date.now() - 31 * 60_000) } });
    expect((await agent.get(`${API}/auth/me`)).status).toBe(401);
  });

  it('una sesión que superó las 12 h absolutas deja de servir aunque haya actividad', async () => {
    const { agent, user } = await loggedInUser(app, 'ana@empresa.com');
    await prisma.session.updateMany({ where: { userId: user.id }, data: { absoluteExpiresAt: new Date(Date.now() - 1000) } });
    expect((await agent.get(`${API}/auth/me`)).status).toBe(401);
  });
});

describe('Cambio de contraseña', () => {
  const change = (agent: request.Agent, currentPassword: string, newPassword: string) =>
    agent.post(`${API}/auth/change-password`).set(XRW).send({ currentPassword, newPassword });

  it('usuario con "debe cambiar contraseña" solo puede usar me, change-password y logout', async () => {
    const { agent } = await loggedInUser(app, 'ana@empresa.com', { mustChangePassword: true });
    const blocked = await agent.get(`${API}/documents/00000000-0000-0000-0000-000000000000/history`);
    expect(blocked.status).toBe(403);
    expect(blocked.body.code).toBe('PASSWORD_CHANGE_REQUIRED');
    expect((await agent.get(`${API}/auth/me`)).status).toBe(200);
    expect((await change(agent, PASSWORD, 'Nueva-Clave-Larga-2026')).status).toBe(204);
    const after = await agent.get(`${API}/documents/00000000-0000-0000-0000-000000000000/history`);
    expect(after.status).toBe(404); // ya no se le bloquea: llega a la lógica real
  });

  it('rechaza la contraseña actual incorrecta y las políticas', async () => {
    const { agent } = await loggedInUser(app, 'ana@empresa.com');
    expect((await change(agent, 'equivocada-123456', 'Nueva-Clave-Larga-2026')).status).toBe(400);
    const weak = await change(agent, PASSWORD, 'corta');
    expect(weak.status).toBe(400);
    expect(weak.body.message).toMatch(/12 caracteres/);
  });

  it('cierra las demás sesiones pero conserva la actual', async () => {
    const { agent, deviceKey } = await loggedInUser(app, 'ana@empresa.com');
    const other = await login(app, 'ana@empresa.com', PASSWORD, deviceKey);
    expect((await change(agent, PASSWORD, 'Nueva-Clave-Larga-2026')).status).toBe(204);
    expect((await agent.get(`${API}/auth/me`)).status).toBe(200);
    expect((await other.agent.get(`${API}/auth/me`)).status).toBe(401);
  });

  it('después solo funciona la contraseña nueva', async () => {
    const { agent, deviceKey } = await loggedInUser(app, 'ana@empresa.com');
    await change(agent, PASSWORD, 'Nueva-Clave-Larga-2026');
    expect((await login(app, 'ana@empresa.com', PASSWORD, deviceKey)).res.status).toBe(401);
    expect((await login(app, 'ana@empresa.com', 'Nueva-Clave-Larga-2026', deviceKey)).res.status).toBe(200);
  });

  it('exige sesión', async () => {
    expect((await request(app.getHttpServer()).post(`${API}/auth/change-password`).set(XRW)
      .send({ currentPassword: 'a', newPassword: 'b' })).status).toBe(401);
  });
});

describe('Auditoría de seguridad', () => {
  it('registra login ok/fallido y dispositivo nuevo con IP y user-agent', async () => {
    const user = await createUser('ana@empresa.com');
    await login(app, 'ana@empresa.com', 'clave-equivocada-123'); // fallo
    await login(app, 'ana@empresa.com', PASSWORD); // dispositivo nuevo
    const { key } = await trustDevice(user.id);
    await login(app, 'ana@empresa.com', PASSWORD, key); // ok
    const events = await prisma.securityEvent.findMany();
    const types = events.map((e) => e.type);
    expect(types).toEqual(expect.arrayContaining(['LOGIN_FAIL', 'DEVICE_NEW', 'LOGIN_OK']));
    const ok = events.find((e) => e.type === 'LOGIN_OK')!;
    expect(ok.userId).toBe(user.id);
    expect(ok.ip).toBeTruthy();
    expect(ok.userAgent).toBe(UA);
    expect(ok.createdAt).toBeInstanceOf(Date);
  });

  it('jamás guarda contraseñas ni tokens en la bitácora', async () => {
    const { agent, loginRes } = await loggedInUser(app, 'ana@empresa.com');
    await login(app, 'ana@empresa.com', 'clave-equivocada-123');
    await agent.post(`${API}/auth/change-password`).set(XRW).send({ currentPassword: PASSWORD, newPassword: 'Nueva-Clave-Larga-2026' });
    const dump = JSON.stringify(await prisma.securityEvent.findMany());
    for (const secret of [PASSWORD, 'clave-equivocada-123', 'Nueva-Clave-Larga-2026', cookieValue(loginRes, 'sisdoc_at')!, cookieValue(loginRes, 'sisdoc_rt')!]) {
      expect(dump).not.toContain(secret);
    }
  });

  it('en la base solo existen hashes: ni el refresh ni la clave del dispositivo en claro', async () => {
    const { loginRes, deviceKey, user } = await loggedInUser(app, 'ana@empresa.com');
    const session = (await prisma.session.findFirst({ where: { userId: user.id } }))!;
    expect(session.refreshHash).not.toBe(cookieValue(loginRes, 'sisdoc_rt'));
    expect(session.refreshHash).toMatch(/^[0-9a-f]{64}$/);
    const device = (await prisma.device.findFirst({ where: { userId: user.id } }))!;
    expect(device.keyHash).not.toBe(deviceKey);
    const u = (await prisma.user.findUnique({ where: { id: user.id } }))!;
    expect(u.passwordHash).toMatch(/^\$argon2id\$/);
  });
});
