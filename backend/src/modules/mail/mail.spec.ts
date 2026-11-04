import { createMailer } from './mail.module';
import { buildRawMessage } from './domain/mime';
import { GmailMailer } from './infrastructure/gmail-mailer';

const cfg = (env: Record<string, string>) => ({ get: (k: string, d?: unknown) => env[k] ?? d }) as never;
const decode = (raw: string) => Buffer.from(raw, 'base64url').toString('utf8');
const FROM = { name: 'Iris', address: 'notificaciones@empresa.com' };
const MSG = { to: 'ana@empresa.com', subject: 'Código', text: 'Tu código es 123456', html: '<b>123456</b>' };

afterEach(() => jest.restoreAllMocks());

describe('buildRawMessage (MIME)', () => {
  it('arma un correo multipart con texto y HTML, en base64url', () => {
    const raw = buildRawMessage(FROM, MSG);
    expect(raw).toMatch(/^[A-Za-z0-9_-]+$/); // base64url: sin +, / ni =
    const text = decode(raw);
    expect(text).toContain('From: Iris <notificaciones@empresa.com>');
    expect(text).toContain('To: ana@empresa.com');
    expect(text).toContain('multipart/alternative');
    expect(text).toContain('text/plain');
    expect(text).toContain('text/html');
  });

  it('codifica tildes y eñes del asunto y del remitente (RFC 2047) y el cuerpo en UTF-8', () => {
    const text = decode(buildRawMessage({ name: 'Notificaciones Año', address: 'n@e.com' }, { ...MSG, subject: 'Recuperación de contraseña', text: 'ñandú' }));
    expect(text).toMatch(/Subject: =\?UTF-8\?B\?[A-Za-z0-9+/=]+\?=/);
    expect(text).toMatch(/From: =\?UTF-8\?B\?/);
    const cuerpo = text.split(/text\/plain[^\n]*\r\n[^\n]*\r\n\r\n/)[1].split('\r\n--')[0];
    expect(Buffer.from(cuerpo.replace(/\r\n/g, ''), 'base64').toString('utf8')).toBe('ñandú');
  });

  it('rechaza saltos de línea en destinatario, asunto o remitente (inyección de encabezados / Bcc oculto)', () => {
    expect(() => buildRawMessage(FROM, { ...MSG, to: 'a@b.com\r\nBcc: espia@x.com' })).toThrow(/To/);
    expect(() => buildRawMessage(FROM, { ...MSG, subject: 'Hola\nBcc: espia@x.com' })).toThrow(/Subject/);
    expect(() => buildRawMessage({ name: 'X\r\nBcc: a@b.c', address: 'n@e.com' }, MSG)).toThrow(/From/);
  });
});

describe('createMailer (elige y valida el proveedor al arrancar)', () => {
  it('sin configurar = apagado: la recuperación de contraseña queda deshabilitada', () => {
    expect(createMailer(cfg({})).enabled).toBe(false);
    expect(createMailer(cfg({ MAIL_DRIVER: 'off' })).enabled).toBe(false);
  });

  it('gmail exige TODAS las credenciales y una dirección válida', () => {
    expect(() => createMailer(cfg({ MAIL_DRIVER: 'gmail' }))).toThrow(/GMAIL_CLIENT_ID.*GMAIL_CLIENT_SECRET.*GMAIL_REFRESH_TOKEN.*MAIL_FROM/);
    const ok = { MAIL_DRIVER: 'gmail', GMAIL_CLIENT_ID: 'i', GMAIL_CLIENT_SECRET: 's', GMAIL_REFRESH_TOKEN: 'r', MAIL_FROM: 'n@e.com' };
    expect(createMailer(cfg(ok)).enabled).toBe(true);
    expect(() => createMailer(cfg({ ...ok, MAIL_FROM: 'no-es-correo' }))).toThrow(/MAIL_FROM/);
  });

  it('el driver "log" imprime códigos en consola: prohibido en producción', () => {
    expect(createMailer(cfg({ MAIL_DRIVER: 'log', NODE_ENV: 'development' })).enabled).toBe(true);
    expect(() => createMailer(cfg({ MAIL_DRIVER: 'log', NODE_ENV: 'production' }))).toThrow(/producción/);
  });

  it('un driver desconocido no arranca', () => {
    expect(() => createMailer(cfg({ MAIL_DRIVER: 'smtp' }))).toThrow(/MAIL_DRIVER inválido/);
  });
});

describe('GmailMailer', () => {
  const mailer = () => new GmailMailer({ clientId: 'i', clientSecret: 's', refreshToken: 'r', fromAddress: 'n@e.com', fromName: 'Iris' });
  const withToken = (m: GmailMailer, token: string | null) =>
    jest.spyOn((m as unknown as { auth: { getAccessToken: () => Promise<{ token: string | null }> } }).auth, 'getAccessToken').mockResolvedValue({ token });

  it('envía a la API de Gmail con el token Bearer y el mensaje en base64url', async () => {
    const m = mailer();
    withToken(m, 'tok-123');
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue(new Response('{}', { status: 200 }));
    await m.send(MSG);
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe('https://gmail.googleapis.com/gmail/v1/users/me/messages/send');
    expect((init as RequestInit).headers).toMatchObject({ Authorization: 'Bearer tok-123' });
    expect(decode(JSON.parse(String((init as RequestInit).body)).raw)).toContain('To: ana@empresa.com');
  });

  it('si Gmail rechaza (4xx/5xx) lanza error SIN incluir el cuerpo del correo', async () => {
    const m = mailer();
    withToken(m, 'tok');
    jest.spyOn(global, 'fetch').mockResolvedValue(new Response(JSON.stringify({ error: { message: 'Insufficient Permission' } }), { status: 403 }));
    const err = await m.send(MSG).catch((e: Error) => e);
    expect((err as Error).message).toBe('Gmail respondió 403');
    expect((err as Error).message).not.toContain('123456');
  });

  it('sin token de acceso (refresh token revocado) falla con un mensaje claro', async () => {
    const m = mailer();
    withToken(m, null);
    await expect(m.send(MSG)).rejects.toThrow(/refresh token/);
  });
});
