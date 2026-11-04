import { ConfigService } from '@nestjs/config';
import { GoogleIdTokenVerifier } from './google-id-token.verifier';
import { TurnstileCaptchaVerifier } from './turnstile-captcha.verifier';

const cfg = (env: Record<string, string>) => new ConfigService(env);

const verifyIdToken = jest.fn();
jest.mock('google-auth-library', () => ({ OAuth2Client: jest.fn().mockImplementation(() => ({ verifyIdToken })) }));

afterEach(() => { jest.restoreAllMocks(); verifyIdToken.mockReset(); });

describe('TurnstileCaptchaVerifier', () => {
  const on = cfg({ CAPTCHA_ENABLED: 'true', TURNSTILE_SECRET_KEY: 'sec' });

  it('se activa solo con true/1/yes/on y exige la clave secreta', () => {
    expect(new TurnstileCaptchaVerifier(cfg({})).enabled).toBe(false);
    expect(new TurnstileCaptchaVerifier(cfg({ CAPTCHA_ENABLED: 'false' })).enabled).toBe(false);
    expect(new TurnstileCaptchaVerifier(cfg({ CAPTCHA_ENABLED: 'TRUE', TURNSTILE_SECRET_KEY: 's' })).enabled).toBe(true);
    expect(() => new TurnstileCaptchaVerifier(cfg({ CAPTCHA_ENABLED: 'true' }))).toThrow(/TURNSTILE_SECRET_KEY/);
  });

  it('envía secret, token e IP a Cloudflare y respeta su veredicto', async () => {
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue(new Response(JSON.stringify({ success: true })));
    expect(await new TurnstileCaptchaVerifier(on).verify('tok', '1.2.3.4')).toBe(true);
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe('https://challenges.cloudflare.com/turnstile/v0/siteverify');
    const body = new URLSearchParams(String((init as RequestInit).body));
    expect(Object.fromEntries(body)).toEqual({ secret: 'sec', response: 'tok', remoteip: '1.2.3.4' });

    jest.spyOn(global, 'fetch').mockResolvedValue(new Response(JSON.stringify({ success: false, 'error-codes': ['timeout-or-duplicate'] })));
    expect(await new TurnstileCaptchaVerifier(on).verify('tok')).toBe(false);
  });

  it('sin token, token enorme, error HTTP o red caída → false (falla cerrado) y sin llamar a Cloudflare cuando no hay token', async () => {
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue(new Response('boom', { status: 500 }));
    const v = new TurnstileCaptchaVerifier(on);
    expect(await v.verify(undefined)).toBe(false);
    expect(await v.verify('')).toBe(false);
    expect(await v.verify('x'.repeat(3000))).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(await v.verify('tok')).toBe(false); // HTTP 500
    fetchMock.mockRejectedValue(new Error('sin red'));
    expect(await v.verify('tok')).toBe(false);
  });
});

describe('GoogleIdTokenVerifier', () => {
  const on = cfg({ GOOGLE_LOGIN_ENABLED: 'true', GOOGLE_CLIENT_ID: 'cid', GOOGLE_ALLOWED_DOMAIN: '@Empresa.com' });

  it('exige el Client ID al activarse y normaliza el dominio', () => {
    expect(new GoogleIdTokenVerifier(cfg({})).enabled).toBe(false);
    expect(() => new GoogleIdTokenVerifier(cfg({ GOOGLE_LOGIN_ENABLED: 'true' }))).toThrow(/GOOGLE_CLIENT_ID/);
    expect(new GoogleIdTokenVerifier(on).allowedDomain).toBe('empresa.com');
    expect(new GoogleIdTokenVerifier(on).autoRegister).toBe(false);
    // una URL u otro valor mal puesto ahí rechazaría a TODOS: el servidor no arranca y lo dice
    expect(() => new GoogleIdTokenVerifier(cfg({ GOOGLE_CLIENT_ID: 'cid', GOOGLE_ALLOWED_DOMAIN: 'http://localhost:5173' }))).toThrow(/GOOGLE_ALLOWED_DOMAIN/);
    expect(new GoogleIdTokenVerifier(cfg({ GOOGLE_CLIENT_ID: 'cid', GOOGLE_AUTO_REGISTER: 'true' })).autoRegister).toBe(true);
    expect(new GoogleIdTokenVerifier(cfg({ GOOGLE_LOGIN_ENABLED: 'true', GOOGLE_CLIENT_ID: 'cid' })).allowedDomain).toBeNull();
  });

  it('valida contra NUESTRO Client ID (audiencia) y devuelve el perfil', async () => {
    verifyIdToken.mockResolvedValue({
      getPayload: () => ({ sub: 's1', email: 'ana@empresa.com', email_verified: true, hd: 'empresa.com', name: 'Ana' }),
    });
    const p = await new GoogleIdTokenVerifier(on).verify('jwt');
    expect(verifyIdToken).toHaveBeenCalledWith({ idToken: 'jwt', audience: 'cid' });
    expect(p).toEqual({ sub: 's1', email: 'ana@empresa.com', emailVerified: true, hostedDomain: 'empresa.com', name: 'Ana' });
  });

  it('email_verified ausente = no verificado; payload incompleto o error de firma = null', async () => {
    verifyIdToken.mockResolvedValue({ getPayload: () => ({ sub: 's1', email: 'a@b.com' }) });
    expect((await new GoogleIdTokenVerifier(on).verify('jwt'))!.emailVerified).toBe(false);
    verifyIdToken.mockResolvedValue({ getPayload: () => ({ sub: 's1' }) });
    expect(await new GoogleIdTokenVerifier(on).verify('jwt')).toBeNull();
    verifyIdToken.mockRejectedValue(new Error('Wrong recipient, payload audience != requiredAudience'));
    expect(await new GoogleIdTokenVerifier(on).verify('jwt')).toBeNull();
  });
});
