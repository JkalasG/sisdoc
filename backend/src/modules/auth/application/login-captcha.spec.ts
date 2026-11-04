import { CaptchaFailedError } from '../domain/auth-errors';
import { buildWorld } from '../testing/fakes';

describe('Captcha en el login con contraseña', () => {
  it('desactivado: no se pide, no se consulta y el login funciona igual', async () => {
    const w = buildWorld();
    await w.userWithTrustedDevice();
    expect((await w.doLogin()).kind).toBe('AUTHENTICATED');
    expect(w.captcha.calls).toHaveLength(0);
  });

  it('activado y sin token: rechaza ANTES de tocar la cuenta (no cuenta intentos, no gasta hash)', async () => {
    const w = buildWorld();
    w.captcha.enabled = true;
    const { user } = await w.userWithTrustedDevice();
    await expect(w.doLogin()).rejects.toBeInstanceOf(CaptchaFailedError);
    expect(w.users.users.get(user.id)!.failedAttempts).toBe(0);
    expect(w.events.types()).toEqual(['CAPTCHA_FAIL']);
  });

  it('activado y token inválido: rechaza aunque la contraseña sea correcta', async () => {
    const w = buildWorld();
    w.captcha.enabled = true;
    await w.userWithTrustedDevice();
    await expect(w.doLogin({ captchaToken: 'falso' })).rejects.toBeInstanceOf(CaptchaFailedError);
    expect(w.sessions.sessions).toHaveLength(0);
  });

  it('activado, con contraseña MALA y sin captcha: el error es el del captcha (no revela si la clave era buena)', async () => {
    const w = buildWorld();
    w.captcha.enabled = true;
    await w.userWithTrustedDevice();
    await expect(w.doLogin({ password: 'incorrecta-123456' })).rejects.toBeInstanceOf(CaptchaFailedError);
  });

  it('activado y token válido: entra, y se envía la IP al proveedor', async () => {
    const w = buildWorld();
    w.captcha.enabled = true;
    w.captcha.valid.add('ok-1');
    await w.userWithTrustedDevice();
    expect((await w.doLogin({ captchaToken: 'ok-1' })).kind).toBe('AUTHENTICATED');
    expect(w.captcha.calls[0]).toEqual({ token: 'ok-1', ip: '10.0.0.5' });
  });

  it('activado: con captcha correcto pero contraseña mala sigue contando el intento', async () => {
    const w = buildWorld();
    w.captcha.enabled = true;
    w.captcha.valid.add('ok-1');
    const { user } = await w.userWithTrustedDevice();
    await expect(w.doLogin({ captchaToken: 'ok-1', password: 'incorrecta-123456' })).rejects.toThrow();
    expect(w.users.users.get(user.id)!.failedAttempts).toBe(1);
  });
});
