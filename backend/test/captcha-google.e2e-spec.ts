import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { GOOGLE_IDENTITY, GoogleIdentity } from '../src/modules/auth/application/ports';
import { GoogleProfile } from '../src/modules/auth/domain/google-policy';
import { createApp, createUser, PASSWORD, prisma, resetDb, trustDevice, UA, XRW } from './helpers';

const API = '/api/v1';
const KEYS = ['GOOGLE_AUTO_REGISTER', 'CAPTCHA_ENABLED', 'TURNSTILE_SITE_KEY', 'TURNSTILE_SECRET_KEY', 'GOOGLE_LOGIN_ENABLED', 'GOOGLE_CLIENT_ID', 'GOOGLE_ALLOWED_DOMAIN'];
const saved: Record<string, string | undefined> = {};

const set = (env: Record<string, string>) => { for (const k of KEYS) { saved[k] ??= process.env[k]; process.env[k] = env[k] ?? ''; } };
afterEach(() => { for (const k of KEYS) process.env[k] = saved[k] ?? ''; jest.restoreAllMocks(); });
beforeEach(resetDb);
afterAll(async () => { await prisma.$disconnect(); });

/** Cloudflare simulado: el token "ok" es válido; cualquier otro, no. */
function mockTurnstile() {
  return jest.spyOn(global, 'fetch').mockImplementation(async (_url, init) => {
    const body = new URLSearchParams(String((init as RequestInit).body));
    return new Response(JSON.stringify({ success: body.get('response') === 'ok' && body.get('secret') === 'secreto' }), {
      status: 200, headers: { 'content-type': 'application/json' },
    });
  });
}

const post = (app: INestApplication, path: string, body: object, cookie?: string) => {
  let r = request(app.getHttpServer()).post(`${API}${path}`).set(XRW).set('User-Agent', UA);
  if (cookie) r = r.set('Cookie', cookie);
  return r.send(body);
};

describe('Todo APAGADO (por defecto)', () => {
  let app: INestApplication;
  beforeAll(async () => { set({}); app = await createApp(); });
  afterAll(async () => { await app.close(); });

  it('GET /auth/config informa que ni captcha ni Google están activos (y no hay claves)', async () => {
    const res = await request(app.getHttpServer()).get(`${API}/auth/config`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      captcha: { enabled: false, siteKey: null }, google: { enabled: false, clientId: null },
      passwordReset: { enabled: false }, // sin correo configurado (MAIL_DRIVER=off) no se ofrece recuperar la contraseña
    });
  });

  it('el login funciona sin captcha', async () => {
    const user = await createUser('ana@empresa.com');
    const { key } = await trustDevice(user.id);
    expect((await post(app, '/auth/login', { email: 'ana@empresa.com', password: PASSWORD }, `sisdoc_dk=${key}`)).status).toBe(200);
  });

  it('POST /auth/google responde 403 GOOGLE_DISABLED', async () => {
    const res = await post(app, '/auth/google', { idToken: 'x'.repeat(40) });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('GOOGLE_DISABLED');
  });
});

describe('Captcha ACTIVADO', () => {
  let app: INestApplication;
  beforeAll(async () => {
    set({ CAPTCHA_ENABLED: 'true', TURNSTILE_SITE_KEY: 'site-publica', TURNSTILE_SECRET_KEY: 'secreto' });
    app = await createApp();
  });
  afterAll(async () => { await app.close(); });

  it('GET /auth/config publica la site key pública y JAMÁS la secreta', async () => {
    const res = await request(app.getHttpServer()).get(`${API}/auth/config`);
    expect(res.body.captcha).toEqual({ enabled: true, siteKey: 'site-publica' });
    expect(JSON.stringify(res.body)).not.toContain('secreto');
  });

  it('sin captchaToken → 400 CAPTCHA_FAILED, aunque la contraseña sea correcta, y no hay sesión', async () => {
    mockTurnstile();
    const user = await createUser('ana@empresa.com');
    const { key } = await trustDevice(user.id);
    const res = await post(app, '/auth/login', { email: 'ana@empresa.com', password: PASSWORD }, `sisdoc_dk=${key}`);
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('CAPTCHA_FAILED');
    expect(res.headers['set-cookie']).toBeUndefined();
  });

  it('token inválido → 400; token válido → 200 con sesión', async () => {
    const fetchMock = mockTurnstile();
    const user = await createUser('ana@empresa.com');
    const { key } = await trustDevice(user.id);
    const cookie = `sisdoc_dk=${key}`;
    const bad = await post(app, '/auth/login', { email: 'ana@empresa.com', password: PASSWORD, captchaToken: 'malo' }, cookie);
    expect(bad.status).toBe(400);
    const good = await post(app, '/auth/login', { email: 'ana@empresa.com', password: PASSWORD, captchaToken: 'ok' }, cookie);
    expect(good.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('un captcha fallido NO cuenta como intento de contraseña (no bloquea la cuenta de la víctima)', async () => {
    mockTurnstile();
    const user = await createUser('ana@empresa.com');
    for (let i = 0; i < 8; i++) await post(app, '/auth/login', { email: 'ana@empresa.com', password: 'incorrecta-123456' });
    const row = await prisma.user.findUnique({ where: { id: user.id } });
    expect(row).toMatchObject({ failedAttempts: 0, lockedUntil: null });
    expect(await prisma.securityEvent.count({ where: { type: 'CAPTCHA_FAIL' } })).toBe(8);
  });

  it('si Cloudflare no responde, el login se rechaza (falla cerrado)', async () => {
    jest.spyOn(global, 'fetch').mockRejectedValue(new Error('sin red'));
    const user = await createUser('ana@empresa.com');
    const { key } = await trustDevice(user.id);
    const res = await post(app, '/auth/login', { email: 'ana@empresa.com', password: PASSWORD, captchaToken: 'ok' }, `sisdoc_dk=${key}`);
    expect(res.status).toBe(400);
  });
});

describe('Google ACTIVADO', () => {
  let app: INestApplication;
  const profiles = new Map<string, GoogleProfile>();
  const fakeGoogle: GoogleIdentity = {
    enabled: true, allowedDomain: null, autoRegister: false, verify: async (t) => profiles.get(t) ?? null,
  };

  beforeAll(async () => {
    set({ GOOGLE_LOGIN_ENABLED: 'true', GOOGLE_CLIENT_ID: 'cliente.apps.googleusercontent.com' });
    app = await createApp((b) => b.overrideProvider(GOOGLE_IDENTITY).useValue(fakeGoogle));
  });
  afterAll(async () => { await app.close(); });
  beforeEach(() => {
    profiles.clear();
    profiles.set('t'.repeat(30) + 'ana', { sub: 'g-ana', email: 'ana@empresa.com', emailVerified: true });
  });
  const TOKEN = 't'.repeat(30) + 'ana';

  it('GET /auth/config publica el Client ID (público) y Google activo', async () => {
    const res = await request(app.getHttpServer()).get(`${API}/auth/config`);
    expect(res.body.google).toEqual({ enabled: true, clientId: 'cliente.apps.googleusercontent.com' });
  });

  it('flujo completo: dispositivo aprobado → cookies de sesión HttpOnly, vínculo guardado y auditoría', async () => {
    const user = await createUser('ana@empresa.com');
    const { key } = await trustDevice(user.id);
    const res = await post(app, '/auth/google', { idToken: TOKEN }, `sisdoc_dk=${key}`);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: 'OK', user: { email: 'ana@empresa.com' } });
    const cookies = (res.headers['set-cookie'] as unknown as string[]).join('\n');
    expect(cookies).toMatch(/sisdoc_at=.*HttpOnly/);
    expect(cookies).toMatch(/sisdoc_rt=.*HttpOnly/);
    expect((await prisma.user.findUnique({ where: { id: user.id } }))!.googleSub).toBe('g-ana');
    expect(await prisma.securityEvent.count({ where: { type: 'GOOGLE_LINKED' } })).toBe(1);
    const ok = await prisma.securityEvent.findFirst({ where: { type: 'LOGIN_OK' } });
    expect(ok!.metadata).toEqual({ method: 'GOOGLE' });
    // la sesión obtenida sirve
    const agent = request.agent(app.getHttpServer());
    const again = await agent.post(`${API}/auth/google`).set(XRW).set('Cookie', `sisdoc_dk=${key}`).send({ idToken: TOKEN });
    expect((await agent.get(`${API}/auth/me`)).status).toBe(200);
    expect(again.status).toBe(200);
  });

  it('un correo que ningún administrador creó → 401 y NO se crea ningún usuario', async () => {
    profiles.set(TOKEN, { sub: 'g-x', email: 'intruso@gmail.com', emailVerified: true });
    const res = await post(app, '/auth/google', { idToken: TOKEN });
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('INVALID_CREDENTIALS');
    expect(await prisma.user.count()).toBe(0);
  });

  it('token inválido → 401, igual que "no existe" (no distingue el motivo)', async () => {
    await createUser('ana@empresa.com');
    const res = await post(app, '/auth/google', { idToken: 'z'.repeat(40) });
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('INVALID_CREDENTIALS');
  });

  it('usuario deshabilitado → 401; no obtiene cookies', async () => {
    const user = await createUser('ana@empresa.com', { status: 'DISABLED' });
    const { key } = await trustDevice(user.id);
    const res = await post(app, '/auth/google', { idToken: TOKEN }, `sisdoc_dk=${key}`);
    expect(res.status).toBe(401);
    expect(String(res.headers['set-cookie'] ?? '')).not.toContain('sisdoc_at');
  });

  it('equipo nuevo → 202 pendiente de aprobación (no hay sesión)', async () => {
    await createUser('ana@empresa.com');
    const res = await post(app, '/auth/google', { idToken: TOKEN });
    expect(res.status).toBe(202);
    expect(res.body.status).toBe('DEVICE_PENDING');
    expect(String(res.headers['set-cookie'])).not.toContain('sisdoc_at');
  });

  it('valida la entrada: sin idToken, muy corto o con campos extra → 400', async () => {
    expect((await post(app, '/auth/google', {})).status).toBe(400);
    expect((await post(app, '/auth/google', { idToken: 'corto' })).status).toBe(400);
    expect((await post(app, '/auth/google', { idToken: TOKEN, admin: true })).status).toBe(400);
  });

  it('exige la cabecera anti-CSRF', async () => {
    const res = await request(app.getHttpServer()).post(`${API}/auth/google`).send({ idToken: TOKEN });
    expect(res.status).toBe(403);
  });

  it('el login con contraseña NO pide captcha cuando solo Google está activo', async () => {
    const user = await createUser('luis@empresa.com');
    const { key } = await trustDevice(user.id);
    expect((await post(app, '/auth/login', { email: 'luis@empresa.com', password: PASSWORD }, `sisdoc_dk=${key}`)).status).toBe(200);
  });
});

describe('Registro con Google ACTIVADO', () => {
  let app: INestApplication;
  const profiles = new Map<string, GoogleProfile>();
  const fakeGoogle: GoogleIdentity = { enabled: true, allowedDomain: null, autoRegister: true, verify: async (t) => profiles.get(t) ?? null };
  const TOKEN = 'n'.repeat(30) + 'nueva';
  const cookieOf = (res: request.Response, name: string) =>
    ((res.headers['set-cookie'] as unknown as string[] | undefined) ?? []).find((c) => c.startsWith(`${name}=`))?.split(';')[0];

  beforeAll(async () => {
    set({ GOOGLE_LOGIN_ENABLED: 'true', GOOGLE_CLIENT_ID: 'cliente.apps.googleusercontent.com', GOOGLE_AUTO_REGISTER: 'true' });
    app = await createApp((b) => b.overrideProvider(GOOGLE_IDENTITY).useValue(fakeGoogle));
  });
  afterAll(async () => { await app.close(); });
  beforeEach(() => { profiles.clear(); profiles.set(TOKEN, { sub: 'g-nora', email: 'nora@empresa.com', emailVerified: true, name: 'Nora Nueva' }); });

  async function adminAgent() {
    const admin = await createUser('admin@empresa.com', { roles: ['ADMIN'], mustChangePassword: false });
    const { key } = await trustDevice(admin.id);
    const agent = request.agent(app.getHttpServer());
    await agent.post(`${API}/auth/login`).set(XRW).set('User-Agent', UA).set('Cookie', `sisdoc_dk=${key}`)
      .send({ email: 'admin@empresa.com', password: PASSWORD }).expect(200);
    return agent;
  }

  it('primer ingreso → 403 ACCOUNT_PENDING_ACTIVATION; cuenta PENDING sin contraseña, sin sesión, y con cookie de dispositivo', async () => {
    const res = await post(app, '/auth/google', { idToken: TOKEN });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('ACCOUNT_PENDING_ACTIVATION');
    expect(res.body.message).toMatch(/administrador/);
    expect(cookieOf(res, 'sisdoc_at')).toBeUndefined();
    expect(cookieOf(res, 'sisdoc_dk')).toBeDefined(); // para que el equipo sea reconocido cuando se apruebe
    const row = await prisma.user.findUnique({ where: { email: 'nora@empresa.com' } });
    expect(row).toMatchObject({ status: 'PENDING', passwordHash: null, googleSub: 'g-nora', displayName: 'Nora Nueva', roles: ['USUARIO'] });
    expect(await prisma.securityEvent.count({ where: { type: 'USER_SELF_REGISTERED' } })).toBe(1);
  });

  it('el dispositivo queda PENDIENTE desde el primer intento y aparece en la lista de dispositivos del administrador', async () => {
    const admin = await adminAgent();
    await post(app, '/auth/google', { idToken: TOKEN });
    const nora = await prisma.user.findUnique({ where: { email: 'nora@empresa.com' } });
    const lista = await admin.get(`${API}/admin/devices`);
    const suyo = lista.body.filter((d: { userId: string }) => d.userId === nora!.id);
    expect(suyo).toHaveLength(1);
    expect(suyo[0]).toMatchObject({ status: 'PENDING', email: 'nora@empresa.com' });
  });

  it('reintentar desde el mismo navegador no duplica cuenta ni dispositivo; la contraseña tampoco sirve', async () => {
    const first = await post(app, '/auth/google', { idToken: TOKEN });
    const cookie = cookieOf(first, 'sisdoc_dk')!;
    expect((await post(app, '/auth/google', { idToken: TOKEN }, cookie)).status).toBe(403);
    expect(await prisma.user.count()).toBe(1);
    expect(await prisma.device.count()).toBe(1);
    expect((await post(app, '/auth/login', { email: 'nora@empresa.com', password: PASSWORD })).status).toBe(401);
  });

  it('dos primeros ingresos simultáneos crean UNA sola cuenta', async () => {
    const [a, b] = await Promise.all([post(app, '/auth/google', { idToken: TOKEN }), post(app, '/auth/google', { idToken: TOKEN })]);
    expect([a.status, b.status]).toEqual([403, 403]);
    expect(await prisma.user.count()).toBe(1);
  });

  it('el administrador activa cuenta y dispositivo (dos pasos seguidos) y el MISMO navegador entra directo', async () => {
    const admin = await adminAgent();
    const first = await post(app, '/auth/google', { idToken: TOKEN });
    const cookie = cookieOf(first, 'sisdoc_dk')!;

    const list = await admin.get(`${API}/admin/users?status=PENDING`);
    expect(list.body).toHaveLength(1);
    expect(list.body[0]).toMatchObject({ email: 'nora@empresa.com', status: 'PENDING' });
    const userId = list.body[0].id;

    const devices = (await admin.get(`${API}/admin/devices`)).body.filter((d: { userId: string }) => d.userId === userId);
    expect((await admin.post(`${API}/admin/users/${userId}/enable`).set(XRW)).body.status).toBe('ACTIVE');
    expect((await admin.post(`${API}/admin/devices/${devices[0].id}/approve`).set(XRW)).status).toBe(204);
    expect((await prisma.securityEvent.findFirst({ where: { type: 'USER_ENABLED' } }))!.metadata).toMatchObject({ from: 'PENDING' });

    const ok = await post(app, '/auth/google', { idToken: TOKEN }, cookie);
    expect(ok.status).toBe(200);
    expect(ok.body.user.email).toBe('nora@empresa.com');
  });

  it('cuenta activa pero desde OTRO navegador → 202 dispositivo pendiente (bloqueo normal)', async () => {
    const admin = await adminAgent();
    const first = await post(app, '/auth/google', { idToken: TOKEN });
    const userId = (await admin.get(`${API}/admin/users?status=PENDING`)).body[0].id;
    const dev = (await admin.get(`${API}/admin/devices`)).body.find((d: { userId: string }) => d.userId === userId);
    await admin.post(`${API}/admin/users/${userId}/enable`).set(XRW);
    await admin.post(`${API}/admin/devices/${dev.id}/approve`).set(XRW);
    expect(cookieOf(first, 'sisdoc_dk')).toBeDefined();

    const otroNavegador = await post(app, '/auth/google', { idToken: TOKEN }); // sin la cookie del equipo aprobado
    expect(otroNavegador.status).toBe(202);
    expect(otroNavegador.body.status).toBe('DEVICE_PENDING');
  });

  it('con el registro apagado, un correo desconocido sigue siendo rechazado sin crear nada', async () => {
    (fakeGoogle as { autoRegister: boolean }).autoRegister = false;
    try {
      const res = await post(app, '/auth/google', { idToken: TOKEN });
      expect(res.status).toBe(401);
      expect(await prisma.user.count()).toBe(0);
      expect(await prisma.device.count()).toBe(0);
    } finally { (fakeGoogle as { autoRegister: boolean }).autoRegister = true; }
  });
});

describe('Configuración incompleta: el servidor se niega a arrancar', () => {
  it('CAPTCHA_ENABLED=true sin claves', async () => {
    set({ CAPTCHA_ENABLED: 'true' });
    await expect(createApp()).rejects.toThrow(/TURNSTILE/);
  });
  it('GOOGLE_LOGIN_ENABLED=true sin Client ID', async () => {
    set({ GOOGLE_LOGIN_ENABLED: 'true' });
    await expect(createApp()).rejects.toThrow(/GOOGLE_CLIENT_ID/);
  });
});
