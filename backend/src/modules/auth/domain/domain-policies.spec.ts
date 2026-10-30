import { clearedState, isLocked, registerFailure } from './lockout-policy';
import { validatePassword } from './password-policy';
import { isSessionActive, SESSION_POLICY, Session, shouldTouch } from './session';
import { describeUserAgent } from './device';
import { normalizeEmail } from './user';

const T0 = new Date('2026-03-02T10:00:00Z');
const min = (n: number) => n * 60_000;

describe('Política de contraseñas', () => {
  const ctx = { email: 'ana.perez@empresa.com' };

  it('acepta una contraseña larga y no común', () => {
    expect(validatePassword('Mi-clave-segura-2026', ctx)).toEqual([]);
  });
  it('rechaza menos de 12 caracteres', () => {
    expect(validatePassword('Corta-1', ctx).join()).toMatch(/al menos 12/);
  });
  it('rechaza más de 128 caracteres', () => {
    expect(validatePassword('a1'.repeat(65), ctx).join()).toMatch(/superar 128/);
  });
  it('rechaza contraseñas comunes', () => {
    expect(validatePassword('password1234', ctx).join()).toMatch(/común/);
  });
  it('rechaza un solo carácter repetido', () => {
    expect(validatePassword('aaaaaaaaaaaaaa', ctx).join()).toMatch(/repetir/);
  });
  it('rechaza si contiene la parte local del correo (sin distinguir mayúsculas)', () => {
    expect(validatePassword('XX-Ana.Perez-2026', ctx).join()).toMatch(/correo/);
  });
});

describe('Política de bloqueo de cuenta', () => {
  it('no bloquea antes del 5.º fallo', () => {
    let s = { failedAttempts: 0, lockoutLevel: 0 };
    for (let i = 0; i < 4; i++) {
      const r = registerFailure(s, T0);
      expect(r.lockedUntil).toBeNull();
      s = r;
    }
    expect(s.failedAttempts).toBe(4);
  });
  it('el 5.º fallo bloquea 15 minutos y sube el nivel', () => {
    const r = registerFailure({ failedAttempts: 4, lockoutLevel: 0 }, T0);
    expect(r.lockedUntil).toEqual(new Date(T0.getTime() + min(15)));
    expect(r.lockoutLevel).toBe(1);
    expect(r.failedAttempts).toBe(0);
  });
  it('es progresivo: 15 → 30 → 60 y se queda en 60', () => {
    const at = (level: number) => registerFailure({ failedAttempts: 4, lockoutLevel: level }, T0).lockedUntil!.getTime() - T0.getTime();
    expect([at(0), at(1), at(2), at(3), at(9)]).toEqual([min(15), min(30), min(60), min(60), min(60)]);
  });
  it('isLocked respeta la fecha de fin', () => {
    const u = { lockedUntil: new Date(T0.getTime() + min(15)) };
    expect(isLocked(u, T0)).toBe(true);
    expect(isLocked(u, new Date(T0.getTime() + min(15)))).toBe(false);
    expect(isLocked({ lockedUntil: null }, T0)).toBe(false);
  });
  it('clearedState deja todo en cero', () => {
    expect(clearedState()).toEqual({ failedAttempts: 0, lockoutLevel: 0, lockedUntil: null });
  });
});

describe('Política de sesión', () => {
  const session = (over: Partial<Session> = {}): Session => ({
    id: 's', userId: 'u', deviceId: 'd', refreshHash: 'h', prevRefreshHash: null, ip: null, userAgent: null,
    createdAt: T0, lastActivityAt: T0, absoluteExpiresAt: new Date(T0.getTime() + SESSION_POLICY.absoluteMs),
    revokedAt: null, revokedReason: null, ...over,
  });

  it('valores acordados: 30 min de inactividad, 12 h absolutas, 3 sesiones', () => {
    expect(SESSION_POLICY.inactivityMs).toBe(min(30));
    expect(SESSION_POLICY.absoluteMs).toBe(12 * 60 * min(1));
    expect(SESSION_POLICY.maxLive).toBe(3);
  });
  it('está activa dentro de los límites', () => {
    expect(isSessionActive(session(), new Date(T0.getTime() + min(29)))).toBe(true);
  });
  it('muere a los 30 minutos sin actividad', () => {
    expect(isSessionActive(session(), new Date(T0.getTime() + min(30)))).toBe(false);
  });
  it('muere al llegar al límite absoluto aunque haya actividad', () => {
    const end = new Date(T0.getTime() + SESSION_POLICY.absoluteMs);
    expect(isSessionActive(session({ lastActivityAt: new Date(end.getTime() - 1000) }), end)).toBe(false);
  });
  it('una sesión revocada nunca está activa', () => {
    expect(isSessionActive(session({ revokedAt: T0 }), T0)).toBe(false);
  });
  it('registra actividad como máximo una vez por minuto', () => {
    expect(shouldTouch(session(), new Date(T0.getTime() + 30_000))).toBe(false);
    expect(shouldTouch(session(), new Date(T0.getTime() + 60_000))).toBe(true);
  });
});

describe('Utilidades de dominio', () => {
  it('normaliza el correo', () => {
    expect(normalizeEmail('  Ana@Empresa.COM ')).toBe('ana@empresa.com');
  });
  it('describe el dispositivo a partir del user-agent', () => {
    expect(describeUserAgent('Mozilla/5.0 (Windows NT 10.0) Chrome/120.0 Safari/537.36')).toBe('Chrome en Windows');
    expect(describeUserAgent(undefined)).toBe('Dispositivo desconocido');
  });
});
