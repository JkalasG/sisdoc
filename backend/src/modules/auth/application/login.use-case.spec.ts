import {
  DeviceBlockedError, InvalidCredentialsError, SessionLimitReachedError,
} from '../domain/auth-errors';
import { SESSION_POLICY } from '../domain/session';
import { buildUser, buildWorld, hours, minutes, PASSWORD } from '../testing/fakes';

describe('LoginUseCase', () => {
  describe('credenciales', () => {
    it('inicia sesión con correo y contraseña correctos desde un dispositivo aprobado', async () => {
      const w = buildWorld();
      await w.userWithTrustedDevice();
      const r = await w.doLogin();
      expect(r.kind).toBe('AUTHENTICATED');
      if (r.kind !== 'AUTHENTICATED') return;
      expect(r.accessToken).toContain('jwt|user-1|');
      expect(r.refreshToken).toBeTruthy();
      expect(w.sessions.sessions).toHaveLength(1);
    });

    it('la sesión creada vence en 12 horas', async () => {
      const w = buildWorld();
      await w.userWithTrustedDevice();
      const r = await w.doLogin();
      if (r.kind !== 'AUTHENTICATED') throw new Error('esperaba sesión');
      expect(r.sessionExpiresAt.getTime() - w.clock.now().getTime()).toBe(hours(12));
    });

    it('normaliza el correo (mayúsculas y espacios)', async () => {
      const w = buildWorld();
      await w.userWithTrustedDevice();
      const r = await w.doLogin({ email: '  ANA@Empresa.com ' });
      expect(r.kind).toBe('AUTHENTICATED');
    });

    it('contraseña incorrecta → InvalidCredentials', async () => {
      const w = buildWorld();
      await w.userWithTrustedDevice();
      await expect(w.doLogin({ password: 'otra-clave-mala' })).rejects.toBeInstanceOf(InvalidCredentialsError);
      expect(w.sessions.sessions).toHaveLength(0);
    });

    it('correo inexistente → el MISMO error y mensaje que contraseña incorrecta', async () => {
      const w = buildWorld();
      await w.userWithTrustedDevice();
      const wrongPass = await w.doLogin({ password: 'mala-mala-mala' }).catch((e) => e);
      const unknown = await w.doLogin({ email: 'nadie@empresa.com' }).catch((e) => e);
      expect(unknown).toBeInstanceOf(InvalidCredentialsError);
      expect(unknown.message).toBe(wrongPass.message);
      expect(unknown.code).toBe(wrongPass.code);
    });

    it('correo inexistente igualmente gasta una verificación de hash (anti-enumeración por tiempo)', async () => {
      const w = buildWorld();
      await w.userWithTrustedDevice();
      await w.doLogin({ email: 'nadie@empresa.com' }).catch(() => undefined);
      expect(w.hasher.dummyCalls).toBe(1);
    });

    it('usuario sin contraseña (solo Google) no entra por contraseña y también gasta hash', async () => {
      const w = buildWorld();
      await w.userWithTrustedDevice({ passwordHash: null });
      await expect(w.doLogin()).rejects.toBeInstanceOf(InvalidCredentialsError);
      expect(w.hasher.dummyCalls).toBe(1);
    });

    it('usuario deshabilitado no entra aunque la contraseña sea correcta, con el mismo error', async () => {
      const w = buildWorld();
      await w.userWithTrustedDevice({ status: 'DISABLED' });
      await expect(w.doLogin()).rejects.toBeInstanceOf(InvalidCredentialsError);
      expect(w.events.last('LOGIN_FAIL')?.metadata).toMatchObject({ reason: 'USER_DISABLED' });
    });

    it('indica si el usuario debe cambiar la contraseña', async () => {
      const w = buildWorld();
      await w.userWithTrustedDevice({ mustChangePassword: true });
      const r = await w.doLogin();
      if (r.kind !== 'AUTHENTICATED') throw new Error('esperaba sesión');
      expect(r.user.mustChangePassword).toBe(true);
    });

    it('no devuelve datos sensibles del usuario', async () => {
      const w = buildWorld();
      await w.userWithTrustedDevice();
      const r = await w.doLogin();
      if (r.kind !== 'AUTHENTICATED') throw new Error('esperaba sesión');
      expect(JSON.stringify(r.user)).not.toMatch(/passwordHash|h:Clave/);
    });
  });

  describe('bloqueo de cuenta', () => {
    it('cuenta los fallos consecutivos', async () => {
      const w = buildWorld();
      const { user } = await w.userWithTrustedDevice();
      await w.doLogin({ password: 'mala-mala-mala' }).catch(() => undefined);
      await w.doLogin({ password: 'mala-mala-mala' }).catch(() => undefined);
      expect(user.failedAttempts).toBe(2);
    });

    it('al 5.º fallo bloquea la cuenta 15 minutos y registra ACCOUNT_LOCKED', async () => {
      const w = buildWorld();
      const { user } = await w.userWithTrustedDevice();
      for (let i = 0; i < 5; i++) await w.doLogin({ password: 'mala-mala-mala' }).catch(() => undefined);
      expect(user.lockedUntil).toEqual(new Date(w.clock.now().getTime() + minutes(15)));
      expect(w.events.types()).toContain('ACCOUNT_LOCKED');
    });

    it('bloqueada: rechaza incluso con la contraseña CORRECTA y sin revelar el bloqueo', async () => {
      const w = buildWorld();
      await w.userWithTrustedDevice();
      for (let i = 0; i < 5; i++) await w.doLogin({ password: 'mala-mala-mala' }).catch(() => undefined);
      const err = await w.doLogin().catch((e) => e);
      expect(err).toBeInstanceOf(InvalidCredentialsError);
      expect(w.events.types()).toContain('LOGIN_BLOCKED');
    });

    it('pasados los 15 minutos vuelve a permitir el ingreso', async () => {
      const w = buildWorld();
      await w.userWithTrustedDevice();
      for (let i = 0; i < 5; i++) await w.doLogin({ password: 'mala-mala-mala' }).catch(() => undefined);
      w.clock.advance(minutes(15) + 1);
      expect((await w.doLogin()).kind).toBe('AUTHENTICATED');
    });

    it('intentos durante el bloqueo no lo extienden', async () => {
      const w = buildWorld();
      const { user } = await w.userWithTrustedDevice();
      for (let i = 0; i < 5; i++) await w.doLogin({ password: 'mala-mala-mala' }).catch(() => undefined);
      const until = user.lockedUntil;
      await w.doLogin({ password: 'mala-mala-mala' }).catch(() => undefined);
      expect(user.lockedUntil).toEqual(until);
    });

    it('el segundo bloqueo dura 30 minutos (progresivo)', async () => {
      const w = buildWorld();
      const { user } = await w.userWithTrustedDevice();
      for (let i = 0; i < 5; i++) await w.doLogin({ password: 'mala-mala-mala' }).catch(() => undefined);
      w.clock.advance(minutes(16));
      for (let i = 0; i < 5; i++) await w.doLogin({ password: 'mala-mala-mala' }).catch(() => undefined);
      expect(user.lockedUntil).toEqual(new Date(w.clock.now().getTime() + minutes(30)));
    });

    it('un ingreso correcto reinicia el contador de fallos', async () => {
      const w = buildWorld();
      const { user } = await w.userWithTrustedDevice();
      for (let i = 0; i < 3; i++) await w.doLogin({ password: 'mala-mala-mala' }).catch(() => undefined);
      await w.doLogin();
      expect(user.failedAttempts).toBe(0);
      expect(user.lockoutLevel).toBe(0);
    });
  });

  describe('dispositivos', () => {
    it('un dispositivo nuevo NO obtiene sesión: queda PENDING y devuelve su clave', async () => {
      const w = buildWorld();
      w.users.add(buildUser());
      const r = await w.doLogin({ deviceKey: undefined });
      expect(r.kind).toBe('DEVICE_PENDING');
      if (r.kind !== 'DEVICE_PENDING') return;
      expect(r.deviceKey).toBeTruthy();
      expect(w.devices.devices).toHaveLength(1);
      expect(w.devices.devices[0]).toMatchObject({ status: 'PENDING', label: 'Chrome en Windows' });
      expect(w.sessions.sessions).toHaveLength(0);
      expect(w.events.types()).toContain('DEVICE_NEW');
    });

    it('acota los pendientes: máximo 5 por usuario, se descarta el más antiguo y no se tocan los aprobados', async () => {
      const w = buildWorld();
      await w.userWithTrustedDevice();
      for (let i = 0; i < 8; i++) { await w.doLogin({ deviceKey: undefined }); w.clock.advance(1_000); }
      const pending = w.devices.devices.filter((d) => d.status === 'PENDING');
      expect(pending).toHaveLength(5);
      expect(pending.map((d) => d.id)).toEqual(['dev-5', 'dev-6', 'dev-7', 'dev-8', 'dev-9']); // sobreviven los más nuevos
      expect(w.devices.devices.filter((d) => d.status === 'TRUSTED')).toHaveLength(1);
    });

    it('descarta pendientes de más de 30 días', async () => {
      const w = buildWorld();
      await w.userWithTrustedDevice();
      await w.doLogin({ deviceKey: undefined });
      w.clock.advance(31 * 24 * 3_600_000);
      await w.doLogin({ deviceKey: undefined });
      expect(w.devices.devices.filter((d) => d.status === 'PENDING')).toHaveLength(1);
    });

    it('con contraseña incorrecta NO se registra ningún dispositivo', async () => {
      const w = buildWorld();
      w.users.add(buildUser());
      await w.doLogin({ deviceKey: undefined, password: 'mala-mala-mala' }).catch(() => undefined);
      expect(w.devices.devices).toHaveLength(0);
    });

    it('mientras siga PENDING no entra y no crea dispositivos duplicados', async () => {
      const w = buildWorld();
      w.users.add(buildUser());
      const first = await w.doLogin({ deviceKey: undefined });
      if (first.kind !== 'DEVICE_PENDING') throw new Error('esperaba pendiente');
      const second = await w.doLogin({ deviceKey: first.deviceKey });
      expect(second.kind).toBe('DEVICE_PENDING');
      expect(w.devices.devices).toHaveLength(1);
      expect(w.events.types()).toContain('DEVICE_PENDING_ATTEMPT');
    });

    it('cuando el admin aprueba el dispositivo, el mismo equipo ya puede entrar', async () => {
      const w = buildWorld();
      w.users.add(buildUser());
      const pending = await w.doLogin({ deviceKey: undefined });
      if (pending.kind !== 'DEVICE_PENDING') throw new Error('esperaba pendiente');
      w.devices.setStatus(w.devices.devices[0].id, 'TRUSTED');
      expect((await w.doLogin({ deviceKey: pending.deviceKey })).kind).toBe('AUTHENTICATED');
    });

    it('un dispositivo BLOQUEADO es rechazado y queda registrado', async () => {
      const w = buildWorld();
      const { device } = await w.userWithTrustedDevice();
      w.devices.setStatus(device.id, 'BLOCKED');
      await expect(w.doLogin()).rejects.toBeInstanceOf(DeviceBlockedError);
      expect(w.events.types()).toContain('DEVICE_BLOCKED_ATTEMPT');
    });

    it('la clave de un dispositivo aprobado de OTRO usuario no sirve (se trata como nuevo)', async () => {
      const w = buildWorld();
      await w.userWithTrustedDevice({}, 'dk-compartido');
      w.users.add(buildUser({ id: 'user-2', email: 'luis@empresa.com' }));
      const r = await w.doLogin({ email: 'luis@empresa.com', deviceKey: 'dk-compartido' });
      expect(r.kind).toBe('DEVICE_PENDING');
    });

    it('en la bitácora guarda solo el hash de la clave del dispositivo, nunca la clave', async () => {
      const w = buildWorld();
      w.users.add(buildUser());
      const r = await w.doLogin({ deviceKey: undefined });
      if (r.kind !== 'DEVICE_PENDING') throw new Error('esperaba pendiente');
      expect(w.devices.devices[0].keyHash).toBe(`sha:${r.deviceKey}`);
      expect(w.devices.devices[0].keyHash).not.toBe(r.deviceKey);
    });
  });

  describe('límite de sesiones simultáneas', () => {
    it('permite 3 sesiones y RECHAZA la 4.ª', async () => {
      const w = buildWorld();
      await w.userWithTrustedDevice();
      for (let i = 0; i < SESSION_POLICY.maxLive; i++) expect((await w.doLogin()).kind).toBe('AUTHENTICATED');
      await expect(w.doLogin()).rejects.toBeInstanceOf(SessionLimitReachedError);
      expect(w.sessions.sessions).toHaveLength(3);
      expect(w.events.types()).toContain('LOGIN_SESSION_LIMIT');
    });

    it('al cerrar una sesión se libera el cupo', async () => {
      const w = buildWorld();
      await w.userWithTrustedDevice();
      const first = await w.doLogin();
      await w.doLogin();
      await w.doLogin();
      if (first.kind !== 'AUTHENTICATED') throw new Error();
      await w.logout.execute({ refreshToken: first.refreshToken });
      expect((await w.doLogin()).kind).toBe('AUTHENTICATED');
    });

    it('una sesión olvidada (30 min sin actividad) ya no ocupa cupo', async () => {
      const w = buildWorld();
      await w.userWithTrustedDevice();
      for (let i = 0; i < 3; i++) await w.doLogin();
      w.clock.advance(minutes(31));
      expect((await w.doLogin()).kind).toBe('AUTHENTICATED');
    });

    it('el límite es por usuario: otro usuario no se ve afectado', async () => {
      const w = buildWorld();
      await w.userWithTrustedDevice();
      for (let i = 0; i < 3; i++) await w.doLogin();
      await w.userWithTrustedDevice({ id: 'user-2', email: 'luis@empresa.com' }, 'dk-2');
      expect((await w.doLogin({ email: 'luis@empresa.com', deviceKey: 'dk-2' })).kind).toBe('AUTHENTICATED');
    });
  });

  describe('auditoría', () => {
    it('registra LOGIN_OK con usuario, dispositivo, sesión, IP y user-agent', async () => {
      const w = buildWorld();
      await w.userWithTrustedDevice();
      await w.doLogin();
      expect(w.events.last('LOGIN_OK')).toMatchObject({
        userId: 'user-1', deviceId: expect.any(String), sessionId: expect.any(String), ip: '10.0.0.5', userAgent: expect.any(String),
      });
    });

    it('registra LOGIN_FAIL con IP, y nunca guarda la contraseña intentada', async () => {
      const w = buildWorld();
      await w.userWithTrustedDevice();
      await w.doLogin({ password: 'secreto-que-no-debe-guardarse' }).catch(() => undefined);
      expect(w.events.last('LOGIN_FAIL')?.ip).toBe('10.0.0.5');
      expect(JSON.stringify(w.events.events)).not.toContain('secreto-que-no-debe-guardarse');
    });

    it('la contraseña correcta tampoco aparece jamás en la bitácora', async () => {
      const w = buildWorld();
      await w.userWithTrustedDevice();
      await w.doLogin();
      expect(JSON.stringify(w.events.events)).not.toContain(PASSWORD);
    });
  });
});
