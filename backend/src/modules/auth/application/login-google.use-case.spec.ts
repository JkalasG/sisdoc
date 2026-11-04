import { GoogleLoginDisabledError, InvalidCredentialsError } from '../domain/auth-errors';
import { displayNameFromGoogle, googleProfileProblem } from '../domain/google-policy';
import { buildWorld } from '../testing/fakes';

const PROFILE = { sub: 'g-123', email: 'ana@empresa.com', emailVerified: true, hostedDomain: 'empresa.com' };

async function googleWorld(over: Record<string, unknown> = {}) {
  const w = buildWorld();
  w.google.enabled = true;
  w.google.profiles.set('token-ana', PROFILE);
  const u = await w.userWithTrustedDevice(over);
  const run = (idToken = 'token-ana', extra: object = {}) =>
    w.loginGoogle.execute({ idToken, deviceKey: 'dk-1', ip: '10.0.0.5', userAgent: 'UA', ...extra });
  return { w, run, ...u };
}

describe('Acceso con Google', () => {
  it('desactivado: el endpoint responde "no habilitado" y no consulta a Google', async () => {
    const { w, run } = await googleWorld();
    w.google.enabled = false;
    await expect(run()).rejects.toBeInstanceOf(GoogleLoginDisabledError);
  });

  it('primer ingreso: vincula el sub a la cuenta existente, audita GOOGLE_LINKED y abre sesión', async () => {
    const { w, run, user } = await googleWorld();
    const r = await run();
    expect(r.kind).toBe('AUTHENTICATED');
    expect(w.users.users.get(user.id)!.googleSub).toBe('g-123');
    expect(w.events.types()).toEqual(expect.arrayContaining(['GOOGLE_LINKED', 'LOGIN_OK']));
    expect(w.events.last('LOGIN_OK')!.metadata).toEqual({ method: 'GOOGLE' });
  });

  it('ingresos siguientes: entra por el sub y no vuelve a vincular', async () => {
    const { w, run } = await googleWorld({ googleSub: 'g-123' });
    expect((await run()).kind).toBe('AUTHENTICATED');
    expect(w.events.types()).not.toContain('GOOGLE_LINKED');
  });

  it('con GOOGLE_AUTO_REGISTER apagado: un correo que el administrador no creó no entra y no crea nada', async () => {
    const { w, run } = await googleWorld();
    w.google.profiles.set('token-intruso', { ...PROFILE, sub: 'g-999', email: 'intruso@empresa.com' });
    await expect(run('token-intruso')).rejects.toBeInstanceOf(InvalidCredentialsError);
    expect(w.users.users.size).toBe(1);
    expect(w.events.last('LOGIN_FAIL')!.metadata).toMatchObject({ reason: 'GOOGLE_UNKNOWN_EMAIL' });
  });

  it('token inválido (firma, audiencia o vencido) → credenciales inválidas', async () => {
    const { run } = await googleWorld();
    await expect(run('token-manipulado')).rejects.toBeInstanceOf(InvalidCredentialsError);
  });

  it('correo sin verificar → rechazado', async () => {
    const { w, run } = await googleWorld();
    w.google.profiles.set('token-ana', { ...PROFILE, emailVerified: false });
    await expect(run()).rejects.toBeInstanceOf(InvalidCredentialsError);
    expect(w.events.last('LOGIN_FAIL')!.metadata).toMatchObject({ reason: 'GOOGLE_EMAIL_NOT_VERIFIED' });
  });

  it('dominio restringido: solo entra el dominio de la empresa', async () => {
    const { w, run } = await googleWorld();
    w.google.allowedDomain = 'empresa.com';
    expect((await run()).kind).toBe('AUTHENTICATED');
    w.google.profiles.set('token-otro', { ...PROFILE, hostedDomain: 'otra.com', email: 'ana@otra.com' });
    await expect(run('token-otro')).rejects.toBeInstanceOf(InvalidCredentialsError);
  });

  it('un correo del mismo usuario pero con OTRA cuenta de Google (sub distinto) no entra ni se vincula', async () => {
    const { w, run, user } = await googleWorld({ googleSub: 'g-original' });
    await expect(run()).rejects.toBeInstanceOf(InvalidCredentialsError);
    expect(w.users.users.get(user.id)!.googleSub).toBe('g-original');
  });

  it('usuario deshabilitado → no entra por Google tampoco, y ni siquiera se vincula', async () => {
    const { w, run, user } = await googleWorld();
    w.users.users.get(user.id)!.status = 'DISABLED';
    await expect(run()).rejects.toBeInstanceOf(InvalidCredentialsError);
    expect(w.users.users.get(user.id)!.googleSub).toBeNull();
  });

  it('cuenta bloqueada por intentos → no entra por Google', async () => {
    const { w, run, user } = await googleWorld();
    w.users.users.get(user.id)!.lockedUntil = new Date(w.clock.now().getTime() + 60_000);
    await expect(run()).rejects.toBeInstanceOf(InvalidCredentialsError);
    expect(w.events.types()).toContain('LOGIN_BLOCKED');
  });

  it('equipo nuevo → queda PENDIENTE de aprobación, igual que con contraseña', async () => {
    const { run } = await googleWorld();
    const r = await run('token-ana', { deviceKey: 'equipo-nuevo' });
    expect(r.kind).toBe('DEVICE_PENDING');
  });

  it('respeta el máximo de 3 sesiones simultáneas', async () => {
    const { run } = await googleWorld();
    for (let i = 0; i < 3; i++) await run();
    await expect(run()).rejects.toMatchObject({ code: 'SESSION_LIMIT' });
  });

  it('un acceso correcto limpia el contador de fallos de contraseña', async () => {
    const { w, run, user } = await googleWorld({ failedAttempts: 3 });
    await run();
    expect(w.users.users.get(user.id)!.failedAttempts).toBe(0);
  });
});

describe('Registro con Google (GOOGLE_AUTO_REGISTER=true)', () => {
  const NUEVO = { sub: 'g-nuevo', email: 'Nuevo@Empresa.com', emailVerified: true, name: 'Nora  Nueva', hostedDomain: 'empresa.com' };
  const nuevaCuenta = (w: Awaited<ReturnType<typeof googleWorld>>['w']) =>
    [...w.users.users.values()].find((u) => u.email === 'nuevo@empresa.com')!;
  async function registro() {
    const x = await googleWorld();
    x.w.google.autoRegister = true;
    x.w.google.profiles.set('token-nuevo', NUEVO);
    return x;
  }

  it('primer ingreso: crea la cuenta PENDIENTE (sin contraseña, rol USUARIO) y la devuelve como ACCOUNT_PENDING', async () => {
    const { w, run } = await registro();
    const r = await run('token-nuevo', { deviceKey: undefined });
    expect(r.kind).toBe('ACCOUNT_PENDING');
    expect(nuevaCuenta(w)).toMatchObject({
      status: 'PENDING', passwordHash: null, googleSub: 'g-nuevo', displayName: 'Nora Nueva', roles: ['USUARIO'], mustChangePassword: false,
    });
    expect(w.events.types()).toContain('USER_SELF_REGISTERED');
    expect(w.sessions.sessions).toHaveLength(0);
  });

  it('el dispositivo nace PENDIENTE junto con la cuenta y se devuelve su clave (para la cookie del navegador)', async () => {
    const { w, run } = await registro();
    const r = await run('token-nuevo', { deviceKey: undefined });
    if (r.kind !== 'ACCOUNT_PENDING') throw new Error('esperaba ACCOUNT_PENDING');
    expect(r.deviceKey).toBeTruthy();
    const dispositivos = w.devices.devices.filter((d) => d.userId === nuevaCuenta(w).id);
    expect(dispositivos).toHaveLength(1);
    expect(dispositivos[0]).toMatchObject({ status: 'PENDING', keyHash: `sha:${r.deviceKey}` });
    expect(w.events.types()).toContain('DEVICE_NEW');
  });

  it('mientras siga pendiente, reintentar desde el mismo equipo no duplica la cuenta ni el dispositivo, y no hay sesión', async () => {
    const { w, run } = await registro();
    const first = await run('token-nuevo', { deviceKey: undefined });
    if (first.kind !== 'ACCOUNT_PENDING') throw new Error('esperaba ACCOUNT_PENDING');
    for (let i = 0; i < 3; i++) expect((await run('token-nuevo', { deviceKey: first.deviceKey })).kind).toBe('ACCOUNT_PENDING');
    expect([...w.users.users.values()].filter((u) => u.email === 'nuevo@empresa.com')).toHaveLength(1);
    expect(w.devices.devices.filter((d) => d.userId === nuevaCuenta(w).id)).toHaveLength(1);
    expect(w.sessions.sessions).toHaveLength(0);
    expect(w.events.last('LOGIN_FAIL')!.metadata).toMatchObject({ reason: 'ACCOUNT_PENDING' });
  });

  it('el administrador aprueba cuenta y dispositivo: el MISMO navegador entra directo, sin segundo bloqueo', async () => {
    const { w, run } = await registro();
    const first = await run('token-nuevo', { deviceKey: undefined });
    if (first.kind !== 'ACCOUNT_PENDING') throw new Error('esperaba ACCOUNT_PENDING');
    nuevaCuenta(w).status = 'ACTIVE';
    w.devices.devices.filter((d) => d.userId === nuevaCuenta(w).id).forEach((d) => w.devices.setStatus(d.id, 'TRUSTED'));
    const r = await run('token-nuevo', { deviceKey: first.deviceKey });
    expect(r.kind).toBe('AUTHENTICATED');
  });

  it('cuenta activada pero entrando desde OTRO equipo: bloqueo de dispositivo normal (pendiente)', async () => {
    const { w, run } = await registro();
    const first = await run('token-nuevo', { deviceKey: undefined });
    if (first.kind !== 'ACCOUNT_PENDING') throw new Error('esperaba ACCOUNT_PENDING');
    nuevaCuenta(w).status = 'ACTIVE';
    w.devices.devices.filter((d) => d.userId === nuevaCuenta(w).id).forEach((d) => w.devices.setStatus(d.id, 'TRUSTED'));
    const otro = await run('token-nuevo', { deviceKey: 'otro-equipo' });
    expect(otro.kind).toBe('DEVICE_PENDING');
  });

  it('cuenta activada pero con el dispositivo SIN aprobar: sigue pendiente de dispositivo', async () => {
    const { w, run } = await registro();
    const first = await run('token-nuevo', { deviceKey: undefined });
    if (first.kind !== 'ACCOUNT_PENDING') throw new Error('esperaba ACCOUNT_PENDING');
    nuevaCuenta(w).status = 'ACTIVE';
    expect((await run('token-nuevo', { deviceKey: first.deviceKey })).kind).toBe('DEVICE_PENDING');
  });

  it('respeta las reglas de Google: correo sin verificar o dominio ajeno NO se registran (ni cuenta ni dispositivo)', async () => {
    const { w, run } = await registro();
    w.google.allowedDomain = 'empresa.com';
    w.google.profiles.set('t-sin-verificar', { ...NUEVO, emailVerified: false });
    w.google.profiles.set('t-ajeno', { ...NUEVO, sub: 'g-x', email: 'x@gmail.com', hostedDomain: undefined });
    const dispositivosAntes = w.devices.devices.length;
    await expect(run('t-sin-verificar')).rejects.toBeInstanceOf(InvalidCredentialsError);
    await expect(run('t-ajeno')).rejects.toBeInstanceOf(InvalidCredentialsError);
    expect(w.users.users.size).toBe(1); // solo la cuenta original de Ana
    expect(w.devices.devices).toHaveLength(dispositivosAntes);
  });

  it('una cuenta DESHABILITADA por un administrador sigue recibiendo el error genérico (no se confunde con pendiente)', async () => {
    const { w, run, user } = await registro();
    w.users.users.get(user.id)!.status = 'DISABLED';
    await expect(run()).rejects.toBeInstanceOf(InvalidCredentialsError);
  });

  it('el estado pendiente solo se revela tras verificar a Google: un token falso recibe el error genérico y no crea nada', async () => {
    const { w, run } = await registro();
    const dispositivosAntes = w.devices.devices.length;
    await expect(run('token-falso')).rejects.toBeInstanceOf(InvalidCredentialsError);
    expect(w.devices.devices).toHaveLength(dispositivosAntes);
  });

  it('el nombre inicial sale de Google o, sin él, del correo', () => {
    expect(displayNameFromGoogle({ ...NUEVO, name: '  Nora   Nueva ' })).toBe('Nora Nueva');
    expect(displayNameFromGoogle({ ...NUEVO, name: undefined })).toBe('Nuevo');
    expect(displayNameFromGoogle({ ...NUEVO, name: undefined, email: 'a@x.com' })).toBe('a_');
  });
});

describe('googleProfileProblem (regla pura)', () => {
  const base = { sub: 's', email: 'a@empresa.com', emailVerified: true, hostedDomain: 'empresa.com' };
  it('acepta un perfil completo, con o sin dominio exigido', () => {
    expect(googleProfileProblem(base, null)).toBeNull();
    expect(googleProfileProblem(base, 'EMPRESA.com')).toBeNull();
  });
  it('rechaza perfil incompleto, correo sin verificar y dominio ajeno', () => {
    expect(googleProfileProblem({ ...base, sub: '' }, null)).toBe('INCOMPLETE_PROFILE');
    expect(googleProfileProblem({ ...base, emailVerified: false }, null)).toBe('EMAIL_NOT_VERIFIED');
    // un gmail.com normal no trae el claim hd
    expect(googleProfileProblem({ ...base, hostedDomain: undefined }, 'empresa.com')).toBe('DOMAIN_NOT_ALLOWED');
    expect(googleProfileProblem({ ...base, email: 'a@otra.com' }, 'empresa.com')).toBe('DOMAIN_NOT_ALLOWED');
  });
});
