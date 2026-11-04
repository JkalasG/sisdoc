import { ValidationError } from '../../../shared/domain/domain-error';
import { CaptchaFailedError, InvalidResetCodeError, PasswordResetDisabledError } from '../domain/auth-errors';
import { decideSend, PASSWORD_RESET } from '../domain/password-reset';
import { resetCodeEmail } from '../domain/reset-email';
import { buildWorld, minutes, PASSWORD } from '../testing/fakes';

const EMAIL = 'ana@empresa.com';
const NUEVA = 'Otra-Clave-Muy-Segura-9';

async function world() {
  const w = buildWorld();
  const { user } = await w.userWithTrustedDevice();
  const ask = (over: object = {}) => w.requestReset.execute({ email: EMAIL, ip: '10.0.0.5', userAgent: 'UA', ...over });
  const confirm = (code: string, over: object = {}) =>
    w.confirmReset.execute({ email: EMAIL, code, newPassword: NUEVA, ip: '10.0.0.5', ...over });
  return { w, user, ask, confirm };
}

describe('Recuperar contraseña: pedir el código', () => {
  it('envía un código de 6 dígitos al correo y guarda solo su hash', async () => {
    const { w, user, ask } = await world();
    await ask();
    const code = w.mailer.lastCode(EMAIL)!;
    expect(code).toMatch(/^\d{6}$/);
    expect(w.mailer.sent[0].subject).toContain(code);
    const row = w.resets.rows.get(user.id)!;
    expect(row).not.toHaveProperty('code'); // el registro no tiene campo para el código en claro
    expect(row.codeHash).toBe(w.otp.hash(user.id, code));
    expect(row.expiresAt.getTime()).toBe(w.clock.now().getTime() + PASSWORD_RESET.ttlMs);
    expect(w.events.types()).toContain('PASSWORD_RESET_REQUESTED');
  });

  it('el correo y la bitácora nunca contienen la contraseña; la bitácora tampoco el código', async () => {
    const { w, ask } = await world();
    await ask();
    expect(JSON.stringify(w.events.events)).not.toContain(w.mailer.lastCode(EMAIL)!);
  });

  it('un correo que no existe recibe el MISMO resultado (sin error) y no se envía nada', async () => {
    const { w, ask } = await world();
    await expect(ask({ email: 'fantasma@empresa.com' })).resolves.toBeUndefined();
    expect(w.mailer.sent).toHaveLength(0);
    expect(w.events.last('PASSWORD_RESET_SKIPPED')!.metadata).toEqual({ reason: 'UNKNOWN_EMAIL' });
  });

  it('cuentas deshabilitadas o pendientes de activación no reciben código', async () => {
    const { w, user, ask } = await world();
    for (const status of ['DISABLED', 'PENDING'] as const) {
      w.users.users.get(user.id)!.status = status;
      await expect(ask()).resolves.toBeUndefined();
    }
    expect(w.mailer.sent).toHaveLength(0);
  });

  it('un segundo código reemplaza al anterior (el viejo deja de servir)', async () => {
    const { w, ask, confirm } = await world();
    await ask();
    const viejo = w.mailer.lastCode(EMAIL)!;
    w.clock.advance(PASSWORD_RESET.resendCooldownMs);
    await ask();
    const nuevo = w.mailer.lastCode(EMAIL)!;
    expect(nuevo).not.toBe(viejo);
    await expect(confirm(viejo)).rejects.toBeInstanceOf(InvalidResetCodeError);
    await expect(confirm(nuevo)).resolves.toBeUndefined();
  });

  it('antes de 60 s no se vuelve a enviar (anti-bombardeo), pero la respuesta es idéntica', async () => {
    const { w, ask } = await world();
    await ask();
    await expect(ask()).resolves.toBeUndefined();
    expect(w.mailer.sent).toHaveLength(1);
    expect(w.events.last('PASSWORD_RESET_SKIPPED')!.metadata).toEqual({ reason: 'COOLDOWN' });
  });

  it('máximo 5 envíos por hora por cuenta; pasada la hora se reinicia el conteo', async () => {
    const { w, ask } = await world();
    for (let i = 0; i < 7; i++) { await ask(); w.clock.advance(PASSWORD_RESET.resendCooldownMs); }
    expect(w.mailer.sent).toHaveLength(PASSWORD_RESET.maxSendsPerHour);
    expect(w.events.last('PASSWORD_RESET_SKIPPED')!.metadata).toEqual({ reason: 'HOURLY_LIMIT' });
    w.clock.advance(PASSWORD_RESET.windowMs);
    await ask();
    expect(w.mailer.sent).toHaveLength(PASSWORD_RESET.maxSendsPerHour + 1);
  });

  it('con captcha activado exige un token válido ANTES de buscar la cuenta', async () => {
    const { w, ask } = await world();
    w.captcha.enabled = true;
    await expect(ask()).rejects.toBeInstanceOf(CaptchaFailedError);
    await expect(ask({ captchaToken: 'falso' })).rejects.toBeInstanceOf(CaptchaFailedError);
    expect(w.mailer.sent).toHaveLength(0);
    w.captcha.valid.add('ok');
    await ask({ captchaToken: 'ok' });
    expect(w.mailer.sent).toHaveLength(1);
  });

  it('con el correo apagado (MAIL_DRIVER=off) la función no existe', async () => {
    const { w, ask } = await world();
    w.mailer.enabled = false;
    await expect(ask()).rejects.toBeInstanceOf(PasswordResetDisabledError);
  });

  it('si Gmail falla, la petición no se cae (misma respuesta) y queda registrado', async () => {
    const { w, ask } = await world();
    w.mailer.fail = true;
    await expect(ask()).resolves.toBeUndefined();
    await new Promise((r) => setImmediate(r));
    expect(w.events.types()).toContain('PASSWORD_RESET_MAIL_FAILED');
  });

  it('decideSend (regla pura): sin registro previo permite y abre la ventana', () => {
    const now = new Date('2026-11-04T10:00:00Z');
    expect(decideSend(null, now)).toEqual({ allowed: true, windowStartedAt: now, sentInWindow: 1 });
  });
});

describe('Recuperar contraseña: confirmar con el código', () => {
  it('con el código correcto cambia la contraseña: la nueva sirve, la vieja no, y el código no se reutiliza', async () => {
    const { w, user, ask, confirm } = await world();
    await ask();
    const code = w.mailer.lastCode(EMAIL)!;
    await confirm(code);
    const u = w.users.users.get(user.id)!;
    expect(await w.hasher.verify(u.passwordHash!, NUEVA)).toBe(true);
    expect(await w.hasher.verify(u.passwordHash!, PASSWORD)).toBe(false);
    expect(u.mustChangePassword).toBe(false);
    expect(w.events.types()).toContain('PASSWORD_RESET_COMPLETED');
    await expect(confirm(code)).rejects.toBeInstanceOf(InvalidResetCodeError); // un solo uso
  });

  it('cierra TODAS las sesiones abiertas y limpia el bloqueo por intentos', async () => {
    const { w, user, ask, confirm } = await world();
    const login = await w.doLogin();
    if (login.kind !== 'AUTHENTICATED') throw new Error('esperaba sesión');
    w.users.users.get(user.id)!.failedAttempts = 4;
    await ask();
    await confirm(w.mailer.lastCode(EMAIL)!);
    expect(w.sessions.sessions.every((s) => s.revokedAt)).toBe(true);
    expect(w.sessions.sessions[0].revokedReason).toBe('PASSWORD_CHANGED');
    expect(w.users.users.get(user.id)!.failedAttempts).toBe(0);
  });

  it('avisa por correo que la contraseña cambió', async () => {
    const { w, ask, confirm } = await world();
    await ask();
    await confirm(w.mailer.lastCode(EMAIL)!);
    await new Promise((r) => setImmediate(r));
    expect(w.mailer.sent.at(-1)!.subject).toBe('Tu contraseña fue cambiada');
    expect(w.mailer.sent.at(-1)!.text).not.toContain(NUEVA);
  });

  it('código incorrecto → error genérico; al 5.º fallo el código muere aunque después se acierte', async () => {
    const { w, ask, confirm } = await world();
    await ask();
    const bueno = w.mailer.lastCode(EMAIL)!;
    const malo = bueno === '000000' ? '000001' : '000000';
    for (let i = 0; i < PASSWORD_RESET.maxAttempts; i++) await expect(confirm(malo)).rejects.toBeInstanceOf(InvalidResetCodeError);
    expect(w.events.last('PASSWORD_RESET_FAILED')!.metadata).toEqual({ reason: 'TOO_MANY_ATTEMPTS' });
    await expect(confirm(bueno)).rejects.toBeInstanceOf(InvalidResetCodeError); // ya hay que pedir otro
  });

  it('los fallos de UN usuario no afectan a otro, y un código no sirve para otra cuenta', async () => {
    const { w, ask, confirm } = await world();
    await w.userWithTrustedDevice({ id: 'user-2', email: 'luis@empresa.com' }, 'dk-2');
    await ask();
    const code = w.mailer.lastCode(EMAIL)!;
    await expect(confirm(code, { email: 'luis@empresa.com' })).rejects.toBeInstanceOf(InvalidResetCodeError);
    await expect(confirm(code)).resolves.toBeUndefined(); // el de Ana sigue intacto
  });

  it('el código vence a los 10 minutos', async () => {
    const { w, ask, confirm } = await world();
    await ask();
    const code = w.mailer.lastCode(EMAIL)!;
    w.clock.advance(PASSWORD_RESET.ttlMs);
    await expect(confirm(code)).rejects.toBeInstanceOf(InvalidResetCodeError);
  });

  it('antes de vencer sigue valiendo (9 min)', async () => {
    const { w, ask, confirm } = await world();
    await ask();
    const code = w.mailer.lastCode(EMAIL)!;
    w.clock.advance(minutes(9));
    await expect(confirm(code)).resolves.toBeUndefined();
  });

  it('formato inválido (letras, 5 o 7 dígitos) cuenta como fallo y no llega a comparar', async () => {
    const { w, ask, confirm } = await world();
    await ask();
    for (const raro of ['abcdef', '12345', '1234567', '']) await expect(confirm(raro)).rejects.toBeInstanceOf(InvalidResetCodeError);
    expect(w.resets.rows.size).toBe(1);
  });

  it('con el código correcto pero una contraseña floja: error de política y el código NO se gasta', async () => {
    const { w, ask, confirm } = await world();
    await ask();
    const code = w.mailer.lastCode(EMAIL)!;
    await expect(confirm(code, { newPassword: 'corta' })).rejects.toBeInstanceOf(ValidationError);
    await expect(confirm(code, { newPassword: 'ana-ana-ana-ana-1' })).rejects.toBeInstanceOf(ValidationError); // contiene su correo
    await expect(confirm(code)).resolves.toBeUndefined();
  });

  it('no permite reutilizar la contraseña actual ni una de las últimas', async () => {
    const { w, ask, confirm } = await world();
    await ask();
    await expect(confirm(w.mailer.lastCode(EMAIL)!, { newPassword: PASSWORD })).rejects.toBeInstanceOf(ValidationError);
  });

  it('usuario inexistente, deshabilitado o sin código reciben el MISMO error', async () => {
    const { w, user, confirm } = await world();
    await expect(confirm('123456', { email: 'fantasma@empresa.com' })).rejects.toBeInstanceOf(InvalidResetCodeError);
    await expect(confirm('123456')).rejects.toBeInstanceOf(InvalidResetCodeError); // sin código pedido
    w.users.users.get(user.id)!.status = 'DISABLED';
    await expect(confirm('123456')).rejects.toBeInstanceOf(InvalidResetCodeError);
  });

  it('dos confirmaciones simultáneas con el código correcto: solo una gana', async () => {
    const { w, ask, confirm } = await world();
    await ask();
    const code = w.mailer.lastCode(EMAIL)!;
    const r = await Promise.allSettled([confirm(code), confirm(code)]);
    expect(r.filter((x) => x.status === 'fulfilled')).toHaveLength(1);
  });

  it('con el correo apagado no se puede confirmar', async () => {
    const { w, confirm } = await world();
    w.mailer.enabled = false;
    await expect(confirm('123456')).rejects.toBeInstanceOf(PasswordResetDisabledError);
  });
});

describe('Contenido del correo', () => {
  it('lleva el código, el plazo y una advertencia; escapa el nombre (sin inyección de HTML)', () => {
    const m = resetCodeEmail('<script>alert(1)</script> & "Ana"', '482913', 10);
    expect(m.subject).toContain('482913');
    expect(m.text).toContain('482913');
    expect(m.text).toContain('10 minutos');
    expect(m.html).not.toContain('<script>');
    expect(m.html).toContain('&lt;script&gt;');
  });
  it('rechaza un "código" que no sea numérico', () => {
    expect(() => resetCodeEmail('Ana', '<b>1</b>', 10)).toThrow();
  });
});
