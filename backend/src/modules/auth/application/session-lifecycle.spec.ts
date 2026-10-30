import { UnauthenticatedError } from '../domain/auth-errors';
import { buildWorld, hours, minutes } from '../testing/fakes';

async function authenticatedWorld() {
  const w = buildWorld();
  await w.userWithTrustedDevice();
  const r = await w.doLogin();
  if (r.kind !== 'AUTHENTICATED') throw new Error('esperaba sesión');
  return { w, login: r, sessionId: w.sessions.sessions[0].id };
}

describe('RefreshSessionUseCase', () => {
  it('emite un nuevo access y un nuevo refresh distinto', async () => {
    const { w, login } = await authenticatedWorld();
    const r = await w.refresh.execute({ refreshToken: login.refreshToken });
    expect(r.refreshToken).not.toBe(login.refreshToken);
    expect(r.accessToken).toContain('jwt|user-1|');
    expect(w.events.types()).toContain('REFRESH_OK');
  });

  it('el refresh anterior deja de servir (rotación)', async () => {
    const { w, login } = await authenticatedWorld();
    await w.refresh.execute({ refreshToken: login.refreshToken });
    await expect(w.refresh.execute({ refreshToken: login.refreshToken })).rejects.toBeInstanceOf(UnauthenticatedError);
  });

  it('REUTILIZAR un refresh viejo revoca la sesión completa, también el refresh nuevo', async () => {
    const { w, login, sessionId } = await authenticatedWorld();
    const second = await w.refresh.execute({ refreshToken: login.refreshToken });
    await expect(w.refresh.execute({ refreshToken: login.refreshToken })).rejects.toBeInstanceOf(UnauthenticatedError); // atacante
    expect(w.sessions.get(sessionId).revokedReason).toBe('ROTATION_REUSE');
    await expect(w.refresh.execute({ refreshToken: second.refreshToken })).rejects.toBeInstanceOf(UnauthenticatedError); // usuario real
    expect(w.events.types()).toContain('REFRESH_REUSE');
  });

  it('un token desconocido es rechazado', async () => {
    const { w } = await authenticatedWorld();
    await expect(w.refresh.execute({ refreshToken: 'inventado' })).rejects.toBeInstanceOf(UnauthenticatedError);
  });

  it('rechaza si pasaron 30 min sin actividad', async () => {
    const { w, login } = await authenticatedWorld();
    w.clock.advance(minutes(30));
    await expect(w.refresh.execute({ refreshToken: login.refreshToken })).rejects.toBeInstanceOf(UnauthenticatedError);
  });

  it('con actividad constante la sesión sigue… hasta las 12 h absolutas', async () => {
    const { w, login } = await authenticatedWorld();
    let token = login.refreshToken;
    for (let i = 0; i < 23; i++) { // cada 25 min durante ~9.6 h
      w.clock.advance(minutes(25));
      token = (await w.refresh.execute({ refreshToken: token })).refreshToken;
    }
    w.clock.advance(hours(12)); // pasa el límite absoluto
    await expect(w.refresh.execute({ refreshToken: token })).rejects.toBeInstanceOf(UnauthenticatedError);
  });

  it('rechaza una sesión revocada', async () => {
    const { w, login } = await authenticatedWorld();
    await w.logout.execute({ refreshToken: login.refreshToken });
    await expect(w.refresh.execute({ refreshToken: login.refreshToken })).rejects.toBeInstanceOf(UnauthenticatedError);
  });

  it('rechaza y revoca si el usuario fue deshabilitado', async () => {
    const { w, login, sessionId } = await authenticatedWorld();
    w.users.users.get('user-1')!.status = 'DISABLED';
    await expect(w.refresh.execute({ refreshToken: login.refreshToken })).rejects.toBeInstanceOf(UnauthenticatedError);
    expect(w.sessions.get(sessionId).revokedReason).toBe('USER_DISABLED');
  });

  it('rechaza y revoca si el dispositivo fue bloqueado', async () => {
    const { w, login, sessionId } = await authenticatedWorld();
    w.devices.setStatus(w.devices.devices[0].id, 'BLOCKED');
    await expect(w.refresh.execute({ refreshToken: login.refreshToken })).rejects.toBeInstanceOf(UnauthenticatedError);
    expect(w.sessions.get(sessionId).revokedReason).toBe('DEVICE_BLOCKED');
  });

  it('en la base solo se guarda el hash del refresh, nunca el token', async () => {
    const { w, login } = await authenticatedWorld();
    expect(w.sessions.sessions[0].refreshHash).not.toBe(login.refreshToken);
    expect(w.sessions.sessions[0].refreshHash).toBe(`sha:${login.refreshToken}`);
  });
});

describe('AuthenticateRequestUseCase (cada petición protegida)', () => {
  it('acepta un access válido con sesión viva', async () => {
    const { w, login } = await authenticatedWorld();
    const ctx = await w.authenticate.execute({ accessToken: login.accessToken });
    expect(ctx).toMatchObject({ userId: 'user-1', mustChangePassword: false });
  });

  it('rechaza un token manipulado o inválido', async () => {
    const { w } = await authenticatedWorld();
    await expect(w.authenticate.execute({ accessToken: 'basura' })).rejects.toBeInstanceOf(UnauthenticatedError);
  });

  it('rechaza un token cuyo sessionId no existe', async () => {
    const { w } = await authenticatedWorld();
    await expect(w.authenticate.execute({ accessToken: 'jwt|user-1|ses-999' })).rejects.toBeInstanceOf(UnauthenticatedError);
  });

  it('rechaza un token que mezcla usuario ajeno con una sesión real', async () => {
    const { w, sessionId } = await authenticatedWorld();
    await expect(w.authenticate.execute({ accessToken: `jwt|otro-usuario|${sessionId}` })).rejects.toBeInstanceOf(UnauthenticatedError);
  });

  it('tras cerrar sesión, el access (aunque no haya vencido) deja de servir al instante', async () => {
    const { w, login } = await authenticatedWorld();
    await w.logout.execute({ refreshToken: login.refreshToken });
    await expect(w.authenticate.execute({ accessToken: login.accessToken })).rejects.toBeInstanceOf(UnauthenticatedError);
  });

  it('rechaza por inactividad de 30 min', async () => {
    const { w, login } = await authenticatedWorld();
    w.clock.advance(minutes(30));
    await expect(w.authenticate.execute({ accessToken: login.accessToken })).rejects.toBeInstanceOf(UnauthenticatedError);
  });

  it('usuario deshabilitado pierde el acceso en la siguiente petición', async () => {
    const { w, login } = await authenticatedWorld();
    w.users.users.get('user-1')!.status = 'DISABLED';
    await expect(w.authenticate.execute({ accessToken: login.accessToken })).rejects.toBeInstanceOf(UnauthenticatedError);
  });

  it('dispositivo bloqueado pierde el acceso en la siguiente petición', async () => {
    const { w, login } = await authenticatedWorld();
    w.devices.setStatus(w.devices.devices[0].id, 'BLOCKED');
    await expect(w.authenticate.execute({ accessToken: login.accessToken })).rejects.toBeInstanceOf(UnauthenticatedError);
  });

  it('la actividad se escribe como máximo una vez por minuto', async () => {
    const { w, login } = await authenticatedWorld();
    for (let i = 0; i < 5; i++) { w.clock.advance(10_000); await w.authenticate.execute({ accessToken: login.accessToken }); }
    expect(w.sessions.touches).toBe(0); // 50 s: aún no
    w.clock.advance(15_000);
    await w.authenticate.execute({ accessToken: login.accessToken });
    expect(w.sessions.touches).toBe(1);
  });

  it('la actividad mantiene viva la sesión más allá de 30 min totales', async () => {
    const { w, login } = await authenticatedWorld();
    for (let i = 0; i < 4; i++) { w.clock.advance(minutes(20)); await w.authenticate.execute({ accessToken: login.accessToken }); }
    await expect(w.authenticate.execute({ accessToken: login.accessToken })).resolves.toBeDefined();
  });
});

describe('LogoutUseCase', () => {
  it('cierra la sesión y deja constancia', async () => {
    const { w, login, sessionId } = await authenticatedWorld();
    await w.logout.execute({ refreshToken: login.refreshToken, ip: '10.0.0.5' });
    expect(w.sessions.get(sessionId).revokedReason).toBe('LOGOUT');
    expect(w.events.last('LOGOUT')).toMatchObject({ userId: 'user-1', sessionId });
  });

  it('solo cierra la sesión indicada; las otras del usuario siguen vivas', async () => {
    const { w, login } = await authenticatedWorld();
    const other = await w.doLogin();
    if (other.kind !== 'AUTHENTICATED') throw new Error();
    await w.logout.execute({ refreshToken: login.refreshToken });
    await expect(w.authenticate.execute({ accessToken: other.accessToken })).resolves.toBeDefined();
  });

  it('es idempotente: un token desconocido o ausente no falla', async () => {
    const { w } = await authenticatedWorld();
    await expect(w.logout.execute({ refreshToken: 'nada' })).resolves.toBeUndefined();
    await expect(w.logout.execute({})).resolves.toBeUndefined();
  });

  it('"cerrar todas" revoca todas las sesiones del usuario', async () => {
    const { w, login } = await authenticatedWorld();
    const b = await w.doLogin();
    if (b.kind !== 'AUTHENTICATED') throw new Error();
    await w.logout.executeAll({ userId: 'user-1' });
    await expect(w.authenticate.execute({ accessToken: login.accessToken })).rejects.toBeInstanceOf(UnauthenticatedError);
    await expect(w.authenticate.execute({ accessToken: b.accessToken })).rejects.toBeInstanceOf(UnauthenticatedError);
    expect(w.events.types()).toContain('LOGOUT_ALL');
  });

  it('"cerrar todas" no toca las sesiones de otro usuario', async () => {
    const { w } = await authenticatedWorld();
    await w.userWithTrustedDevice({ id: 'user-2', email: 'luis@empresa.com' }, 'dk-2');
    const luis = await w.doLogin({ email: 'luis@empresa.com', deviceKey: 'dk-2' });
    if (luis.kind !== 'AUTHENTICATED') throw new Error();
    await w.logout.executeAll({ userId: 'user-1' });
    await expect(w.authenticate.execute({ accessToken: luis.accessToken })).resolves.toBeDefined();
  });
});
