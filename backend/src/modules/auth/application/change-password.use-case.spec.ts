import { UnauthenticatedError } from '../domain/auth-errors';
import { ValidationError } from '../../../shared/domain/domain-error';
import { buildWorld, minutes, PASSWORD } from '../testing/fakes';

const NEW_PASSWORD = 'Otra-Clave-Larga-2026';

async function setup(userOver = {}) {
  const w = buildWorld();
  const { user } = await w.userWithTrustedDevice(userOver);
  const a = await w.doLogin();
  if (a.kind !== 'AUTHENTICATED') throw new Error();
  const sessionId = w.sessions.sessions[0].id;
  const change = (over: Partial<Parameters<typeof w.changePassword.execute>[0]> = {}) =>
    w.changePassword.execute({ userId: 'user-1', sessionId, currentPassword: PASSWORD, newPassword: NEW_PASSWORD, ip: '10.0.0.5', ...over });
  return { w, user, sessionId, change, first: a };
}

describe('ChangePasswordUseCase', () => {
  it('cambia la contraseña con la actual correcta y una nueva válida', async () => {
    const { user, change } = await setup();
    await change();
    expect(user.passwordHash).toBe(`h:${NEW_PASSWORD}`);
  });

  it('quita la obligación de cambiarla (mustChangePassword)', async () => {
    const { user, change } = await setup({ mustChangePassword: true });
    await change();
    expect(user.mustChangePassword).toBe(false);
  });

  it('rechaza si la contraseña actual es incorrecta', async () => {
    const { user, change } = await setup();
    await expect(change({ currentPassword: 'no-es-la-actual' })).rejects.toBeInstanceOf(ValidationError);
    expect(user.passwordHash).toBe(`h:${PASSWORD}`);
  });

  it('adivinar la contraseña actual cuenta para el bloqueo de la cuenta', async () => {
    const { user, change, w } = await setup();
    for (let i = 0; i < 5; i++) await change({ currentPassword: 'no-es-la-actual' }).catch(() => undefined);
    expect(user.lockedUntil).not.toBeNull();
    await expect(change()).rejects.toBeInstanceOf(ValidationError); // ni con la correcta mientras dure el bloqueo
    expect(w.events.types()).toContain('PASSWORD_CHANGE_FAIL');
  });

  it.each([
    ['muy corta', 'Corta-1', /al menos 12/],
    ['común', 'password1234', /común/],
    ['contiene su correo', 'xx-ana-empresa-2026', /correo/],
  ])('rechaza una nueva contraseña %s', async (_n, bad, msg) => {
    const { change } = await setup();
    await expect(change({ newPassword: bad })).rejects.toThrow(msg);
  });

  it('rechaza reutilizar la contraseña actual', async () => {
    const { change } = await setup();
    await expect(change({ newPassword: PASSWORD })).rejects.toThrow(/reutilizar/);
  });

  it('rechaza reutilizar una de las últimas 5 contraseñas', async () => {
    const { change, w, sessionId } = await setup();
    await change({ newPassword: 'Segunda-Clave-Larga-1' });
    await w.changePassword.execute({ userId: 'user-1', sessionId, currentPassword: 'Segunda-Clave-Larga-1', newPassword: 'Tercera-Clave-Larga-2' });
    await expect(
      w.changePassword.execute({ userId: 'user-1', sessionId, currentPassword: 'Tercera-Clave-Larga-2', newPassword: 'Segunda-Clave-Larga-1' }),
    ).rejects.toThrow(/reutilizar/);
  });

  it('cierra TODAS las demás sesiones pero conserva la actual', async () => {
    const { w, change, first } = await setup();
    const second = await w.doLogin();
    if (second.kind !== 'AUTHENTICATED') throw new Error();
    await change();
    await expect(w.authenticate.execute({ accessToken: first.accessToken })).resolves.toBeDefined();
    await expect(w.authenticate.execute({ accessToken: second.accessToken })).rejects.toBeInstanceOf(UnauthenticatedError);
    expect(w.sessions.sessions[1].revokedReason).toBe('PASSWORD_CHANGED');
  });

  it('con la contraseña vieja ya no se puede iniciar sesión; con la nueva sí', async () => {
    const { w, change } = await setup();
    await change();
    await expect(w.doLogin()).rejects.toBeDefined();
    expect((await w.doLogin({ password: NEW_PASSWORD })).kind).toBe('AUTHENTICATED');
  });

  it('registra PASSWORD_CHANGED sin incluir ninguna contraseña', async () => {
    const { w, change } = await setup();
    await change();
    expect(w.events.types()).toContain('PASSWORD_CHANGED');
    const dump = JSON.stringify(w.events.events);
    expect(dump).not.toContain(NEW_PASSWORD);
    expect(dump).not.toContain(PASSWORD);
  });

  it('rechaza si el usuario está deshabilitado', async () => {
    const { change, user } = await setup();
    user.status = 'DISABLED';
    await expect(change()).rejects.toBeInstanceOf(UnauthenticatedError);
  });

  it('pasado el bloqueo se puede volver a intentar', async () => {
    const { change, w } = await setup();
    for (let i = 0; i < 5; i++) await change({ currentPassword: 'no-es-la-actual' }).catch(() => undefined);
    w.clock.advance(minutes(16));
    await expect(change()).resolves.toBeUndefined();
  });
});
