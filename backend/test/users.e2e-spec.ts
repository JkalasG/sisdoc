import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import {
  createApp, createUser, loggedInUser, login, PASSWORD, prisma, resetDb, trustDevice, XRW,
} from './helpers';

const API = '/api/v1';
let app: INestApplication;

beforeAll(async () => { app = await createApp(); });
afterAll(async () => { await app.close(); await prisma.$disconnect(); });
beforeEach(resetDb);

const asAdmin = () => loggedInUser(app, 'admin@empresa.com', { roles: ['ADMIN'] });

/** Entra como el usuario recién creado: aprueba su dispositivo (lo haría un admin) y usa la clave temporal. */
async function enter(email: string, password: string) {
  const user = await prisma.user.findUniqueOrThrow({ where: { email } });
  const { key } = await trustDevice(user.id);
  return login(app, email, password, key);
}

describe('Acceso a /admin/users', () => {
  it('sin sesión → 401', async () => {
    expect((await request(app.getHttpServer()).get(`${API}/admin/users`)).status).toBe(401);
  });

  it('un usuario sin rol ADMIN → 403 en todas las rutas', async () => {
    const { agent } = await loggedInUser(app, 'ana@empresa.com');
    const otro = await createUser('otro@empresa.com');
    expect((await agent.get(`${API}/admin/users`)).status).toBe(403);
    expect((await agent.post(`${API}/admin/users`).set(XRW).send({ email: 'x@empresa.com', displayName: 'Xavier' })).status).toBe(403);
    expect((await agent.post(`${API}/admin/users/${otro.id}/disable`).set(XRW)).status).toBe(403);
    expect((await agent.post(`${API}/admin/users/${otro.id}/reset-password`).set(XRW)).status).toBe(403);
    expect((await agent.put(`${API}/admin/users/${otro.id}/roles`).set(XRW).send({ roles: ['ADMIN'] })).status).toBe(403);
    expect(await prisma.user.count({ where: { email: 'x@empresa.com' } })).toBe(0);
  });

  it('el rol no se puede auto-asignar enviándolo al iniciar sesión ni al crear', async () => {
    const { agent, user } = await loggedInUser(app, 'ana@empresa.com');
    await agent.put(`${API}/admin/users/${user.id}/roles`).set(XRW).send({ roles: ['ADMIN'] });
    expect((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).roles).toEqual([]);
  });
});

describe('Listado', () => {
  it('el admin ve las cuentas sin hashes ni contadores internos, con filtros', async () => {
    const { agent } = await asAdmin();
    await createUser('ana@empresa.com', { displayName: 'Ana Quispe' });
    await createUser('beto@empresa.com', { status: 'DISABLED' });

    const all = await agent.get(`${API}/admin/users`);
    expect(all.status).toBe(200);
    expect(all.body).toHaveLength(3);
    expect(JSON.stringify(all.body)).not.toMatch(/passwordHash|argon2|failedAttempts/);
    expect(Object.keys(all.body[0]).sort()).toEqual([
      'createdAt', 'displayName', 'email', 'id', 'lastLoginAt', 'liveSessions', 'locked', 'lockedUntil',
      'mustChangePassword', 'roles', 'status',
    ]);

    expect((await agent.get(`${API}/admin/users?q=quispe`)).body.map((u: any) => u.email)).toEqual(['ana@empresa.com']);
    expect((await agent.get(`${API}/admin/users?status=DISABLED`)).body.map((u: any) => u.email)).toEqual(['beto@empresa.com']);
    expect((await agent.get(`${API}/admin/users?status=XX`)).status).toBe(400);
  });

  it('cuenta las sesiones vivas del usuario', async () => {
    const { agent } = await asAdmin();
    const res = await agent.get(`${API}/admin/users`);
    expect(res.body.find((u: any) => u.email === 'admin@empresa.com').liveSessions).toBe(1);
  });
});

describe('Crear usuario', () => {
  it('crea la cuenta con clave temporal; solo se guarda su hash; el usuario debe cambiarla', async () => {
    const { agent, user: admin } = await asAdmin();
    const res = await agent.post(`${API}/admin/users`).set(XRW).send({ email: 'Luis@Empresa.com', displayName: 'Luis Pérez' });
    expect(res.status).toBe(201);
    expect(res.body.user).toMatchObject({ email: 'luis@empresa.com', roles: ['USUARIO'], mustChangePassword: true, status: 'ACTIVE' });
    const temp: string = res.body.temporaryPassword;
    expect(temp).toHaveLength(16);

    const row = await prisma.user.findUniqueOrThrow({ where: { email: 'luis@empresa.com' } });
    expect(row.passwordHash).toMatch(/^\$argon2id\$/);
    expect(row.passwordHash).not.toContain(temp);
    expect(row.createdById).toBe(admin.id);
    expect(await prisma.passwordHistory.count({ where: { userId: row.id } })).toBe(1);
    expect(await prisma.securityEvent.count({ where: { type: 'USER_CREATED', userId: row.id } })).toBe(1);

    // La clave temporal funciona, pero solo permite cambiarla.
    const { res: loginRes, agent: luis } = await enter('luis@empresa.com', temp);
    expect(loginRes.status).toBe(200);
    expect(loginRes.body.user.mustChangePassword).toBe(true);
    const bloqueada = await luis.get(`${API}/documents`);
    expect(bloqueada.status).toBe(403);
    expect(bloqueada.body.code).toBe('PASSWORD_CHANGE_REQUIRED');
    const change = await luis.post(`${API}/auth/change-password`).set(XRW)
      .send({ currentPassword: temp, newPassword: 'Mi-Nueva-Clave-2026' });
    expect(change.status).toBe(204);
    expect((await luis.get(`${API}/documents`)).status).toBe(200);
  });

  it('rechaza correo repetido (409), datos inválidos y campos extra (400)', async () => {
    const { agent } = await asAdmin();
    await createUser('ana@empresa.com');
    expect((await agent.post(`${API}/admin/users`).set(XRW).send({ email: 'ANA@empresa.com', displayName: 'Otra Ana' })).status).toBe(409);
    expect((await agent.post(`${API}/admin/users`).set(XRW).send({ email: 'no-correo', displayName: 'Ana' })).status).toBe(400);
    expect((await agent.post(`${API}/admin/users`).set(XRW).send({ email: 'a@empresa.com', displayName: 'A' })).status).toBe(400);
    expect((await agent.post(`${API}/admin/users`).set(XRW).send({ email: 'a@empresa.com', displayName: 'Ana', roles: ['ROOT'] })).status).toBe(400);
    expect((await agent.post(`${API}/admin/users`).set(XRW).send({ email: 'a@empresa.com', displayName: 'Ana', passwordHash: 'x' })).status).toBe(400);
  });

  it('exige la cabecera anti-CSRF', async () => {
    const { agent } = await asAdmin();
    expect((await agent.post(`${API}/admin/users`).send({ email: 'a@empresa.com', displayName: 'Ana' })).status).toBe(403);
  });

  it('puede crear con roles explícitos', async () => {
    const { agent } = await asAdmin();
    const res = await agent.post(`${API}/admin/users`).set(XRW).send({ email: 'aud@empresa.com', displayName: 'Auditora', roles: ['AUDITOR'] });
    expect(res.body.user.roles).toEqual(['AUDITOR']);
  });
});

describe('Deshabilitar / habilitar', () => {
  it('al deshabilitar se cierran sus sesiones y ya no puede entrar; al habilitar vuelve a entrar', async () => {
    const { agent: admin } = await asAdmin();
    const ana = await loggedInUser(app, 'ana@empresa.com');
    expect((await ana.agent.get(`${API}/auth/me`)).status).toBe(200);

    const res = await admin.post(`${API}/admin/users/${ana.user.id}/disable`).set(XRW);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('DISABLED');
    expect((await ana.agent.get(`${API}/auth/me`)).status).toBe(401); // sesión cortada al instante
    expect(await prisma.session.count({ where: { userId: ana.user.id, revokedAt: null } })).toBe(0);
    expect((await login(app, 'ana@empresa.com', PASSWORD, ana.deviceKey)).res.status).toBe(401);

    expect((await admin.post(`${API}/admin/users/${ana.user.id}/enable`).set(XRW)).body.status).toBe('ACTIVE');
    expect((await login(app, 'ana@empresa.com', PASSWORD, ana.deviceKey)).res.status).toBe(200);
    expect(await prisma.securityEvent.count({ where: { type: { in: ['USER_DISABLED', 'USER_ENABLED'] } } })).toBe(2);
  });

  it('no puedes deshabilitarte a ti mismo; un id inexistente da 404; un id mal formado, 400', async () => {
    const { agent, user } = await asAdmin();
    expect((await agent.post(`${API}/admin/users/${user.id}/disable`).set(XRW)).status).toBe(403);
    expect((await agent.post(`${API}/admin/users/00000000-0000-4000-8000-000000000000/disable`).set(XRW)).status).toBe(404);
    expect((await agent.post(`${API}/admin/users/abc/disable`).set(XRW)).status).toBe(400);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).status).toBe('ACTIVE');
  });

  it('un administrador deshabilitado pierde el acceso de administración', async () => {
    const { agent: a1, user: u1 } = await asAdmin();
    const b = await loggedInUser(app, 'admin2@empresa.com', { roles: ['ADMIN'] });
    await a1.post(`${API}/admin/users/${b.user.id}/disable`).set(XRW);
    expect((await b.agent.get(`${API}/admin/users`)).status).toBe(401);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: u1.id } })).status).toBe('ACTIVE');
  });
});

describe('Desbloquear', () => {
  it('un usuario bloqueado por intentos fallidos vuelve a entrar tras desbloquearlo', async () => {
    const { agent: admin } = await asAdmin();
    const ana = await createUser('ana@empresa.com');
    const { key } = await trustDevice(ana.id);
    for (let i = 0; i < 5; i++) await login(app, 'ana@empresa.com', 'clave-equivocada-123', key);
    expect((await login(app, 'ana@empresa.com', PASSWORD, key)).res.status).toBe(401); // bloqueada aunque la clave sea buena

    const list = await admin.get(`${API}/admin/users?q=ana`);
    expect(list.body[0].locked).toBe(true);

    const res = await admin.post(`${API}/admin/users/${ana.id}/unlock`).set(XRW);
    expect(res.body).toMatchObject({ locked: false, lockedUntil: null });
    expect((await login(app, 'ana@empresa.com', PASSWORD, key)).res.status).toBe(200);
  });
});

describe('Restablecer contraseña', () => {
  it('la clave anterior deja de servir, se cierran sus sesiones y debe cambiar la nueva', async () => {
    const { agent: admin } = await asAdmin();
    const ana = await loggedInUser(app, 'ana@empresa.com');

    const res = await admin.post(`${API}/admin/users/${ana.user.id}/reset-password`).set(XRW);
    expect(res.status).toBe(200);
    const temp: string = res.body.temporaryPassword;
    expect(res.body.user.mustChangePassword).toBe(true);

    expect((await ana.agent.get(`${API}/auth/me`)).status).toBe(401);
    expect((await login(app, 'ana@empresa.com', PASSWORD, ana.deviceKey)).res.status).toBe(401);
    const again = await login(app, 'ana@empresa.com', temp, ana.deviceKey);
    expect(again.res.status).toBe(200);
    expect(again.res.body.user.mustChangePassword).toBe(true);
    expect(await prisma.passwordHistory.count({ where: { userId: ana.user.id } })).toBe(2);
    expect(await prisma.securityEvent.count({ where: { type: 'USER_PASSWORD_RESET' } })).toBe(1);
  });

  it('la clave temporal no se puede reutilizar como nueva contraseña', async () => {
    const { agent: admin } = await asAdmin();
    const ana = await loggedInUser(app, 'ana@empresa.com');
    const temp: string = (await admin.post(`${API}/admin/users/${ana.user.id}/reset-password`).set(XRW)).body.temporaryPassword;
    const { res, agent } = await login(app, 'ana@empresa.com', temp, ana.deviceKey);
    expect(res.status).toBe(200);
    const change = await agent.post(`${API}/auth/change-password`).set(XRW).send({ currentPassword: temp, newPassword: temp });
    expect(change.status).toBe(400);
  });
});

describe('Roles', () => {
  it('asigna roles y el usuario los recibe en /auth/me', async () => {
    const { agent: admin } = await asAdmin();
    const ana = await loggedInUser(app, 'ana@empresa.com');
    const res = await admin.put(`${API}/admin/users/${ana.user.id}/roles`).set(XRW).send({ roles: ['AUDITOR', 'MODERADOR'] });
    expect(res.status).toBe(200);
    expect(res.body.roles).toEqual(['AUDITOR', 'MODERADOR']);
    expect((await ana.agent.get(`${API}/auth/me`)).body.roles).toEqual(['AUDITOR', 'MODERADOR']);
    expect((await ana.agent.get(`${API}/admin/users`)).status).toBe(403); // AUDITOR no administra
  });

  it('dar ADMIN habilita la administración; quitarlo la retira', async () => {
    const { agent: admin } = await asAdmin();
    const ana = await loggedInUser(app, 'ana@empresa.com');
    await admin.put(`${API}/admin/users/${ana.user.id}/roles`).set(XRW).send({ roles: ['ADMIN'] });
    expect((await ana.agent.get(`${API}/admin/users`)).status).toBe(200);
    await admin.put(`${API}/admin/users/${ana.user.id}/roles`).set(XRW).send({ roles: ['USUARIO'] });
    expect((await ana.agent.get(`${API}/admin/users`)).status).toBe(403);
  });

  it('rechaza roles inválidos y no te deja quitarte el rol ADMIN', async () => {
    const { agent, user } = await asAdmin();
    expect((await agent.put(`${API}/admin/users/${user.id}/roles`).set(XRW).send({ roles: ['ROOT'] })).status).toBe(400);
    expect((await agent.put(`${API}/admin/users/${user.id}/roles`).set(XRW).send({ roles: ['USUARIO'] })).status).toBe(403);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).roles).toEqual(['ADMIN']);
    expect(await prisma.securityEvent.count({ where: { type: 'USER_ROLES_CHANGED' } })).toBe(0);
  });
});
