import { Check, Circle, MailCheck } from 'lucide-react';
import { FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ApiError } from '@/shared/api/http';
import type { AuthConfig } from '@/shared/api/types';
import { notify, Notifications } from '@/shared/ui/notify';
import { Spinner } from '@/shared/ui/primitives';
import { authApi } from '../api/auth.api';
import { Turnstile, TurnstileHandle } from '../components/Turnstile';
import { passwordRules } from '../lib/password-rules';

const RESEND_SECONDS = 60;
const CODE_RE = /^\d{6}$/;

/** Recuperar la contraseña: 1) correo → 2) código de 6 dígitos + contraseña nueva. */
export function ForgotPasswordPage() {
  const navigate = useNavigate();
  const [auth, setAuth] = useState<AuthConfig | null>(null);
  const [authError, setAuthError] = useState(false);
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [next, setNext] = useState('');
  const [again, setAgain] = useState('');
  const [busy, setBusy] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const captcha = useRef<TurnstileHandle>(null);

  const loadConfig = useCallback(() => {
    setAuthError(false);
    authApi.config().then(setAuth).catch(() => setAuthError(true));
  }, []);
  useEffect(loadConfig, [loadConfig]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const captchaOn = auth?.captcha.enabled === true && !!auth.captcha.siteKey;
  const checks = passwordRules(next, email);
  const passwordOk = checks.every((c) => c.ok) && next === again;

  /** Pide (o reenvía) el código. La respuesta es la misma exista o no el correo, y así se le dice al usuario. */
  async function sendCode(e?: FormEvent) {
    e?.preventDefault();
    setBusy(true);
    try {
      await authApi.requestPasswordReset(email.trim(), captchaOn ? captchaToken ?? undefined : undefined);
      notify.success('Si el correo está registrado, te enviamos un código de 6 dígitos. Revisa también el spam.');
      setStep('code');
      setCooldown(RESEND_SECONDS);
    } catch (err) {
      notify.error((err as ApiError).message);
    } finally {
      captcha.current?.reset(); // cada token de captcha sirve una sola vez
      setBusy(false);
    }
  }

  async function confirm(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await authApi.confirmPasswordReset(email.trim(), code, next);
      notify.success('Contraseña actualizada. Inicia sesión con la nueva.');
      navigate('/login', { replace: true });
    } catch (err) {
      notify.error((err as ApiError).message);
    } finally {
      setBusy(false);
    }
  }

  if (auth && !auth.passwordReset.enabled) {
    return (
      <Shell>
        <h1 className="text-2xl">Recuperar contraseña</h1>
        <p className="text-sm text-ink-soft">Esta opción no está disponible. Contacta a un administrador para que restablezca tu contraseña.</p>
        <Link to="/login" className="btn-primary w-full text-center">Volver a iniciar sesión</Link>
      </Shell>
    );
  }

  return (
    <Shell>
      <div>
        <h1 className="text-2xl">Recuperar contraseña</h1>
        <p className="mt-1 text-sm text-ink-soft">
          {step === 'email' ? 'Te enviaremos un código de un solo uso a tu correo.' : <>Escribe el código que enviamos a <strong>{email}</strong> y elige tu nueva contraseña.</>}
        </p>
      </div>

      {authError && (
        <p role="alert" className="text-sm text-danger">
          No se pudo cargar la configuración. <button type="button" className="font-semibold underline" onClick={loadConfig}>Reintentar</button>
        </p>
      )}

      {step === 'email' ? (
        <form onSubmit={sendCode} className="space-y-4" noValidate>
          <div>
            <label className="label" htmlFor="rec-email">Correo</label>
            <input id="rec-email" name="email" type="email" autoComplete="username" required className="field" placeholder="Correo institucional"
              value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          {captchaOn && <Turnstile ref={captcha} siteKey={auth!.captcha.siteKey!} onToken={setCaptchaToken} />}
          <button className="btn-primary w-full" disabled={busy || !auth || !email.includes('@') || (captchaOn && !captchaToken)}>
            {busy ? <Spinner className="h-5 w-5" /> : 'Enviar código'}
          </button>
        </form>
      ) : (
        <form onSubmit={confirm} className="space-y-4" noValidate>
          <div className="flex items-center gap-2 rounded-lg bg-ok-soft px-3 py-2 text-sm text-ok-ink">
            <MailCheck className="h-4 w-4 shrink-0" /> El código vence en 10 minutos y solo sirve una vez.
          </div>
          <div>
            <label className="label" htmlFor="rec-code">Código de 6 dígitos</label>
            <input id="rec-code" name="code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} className="field text-center text-2xl tracking-[0.5em]"
              placeholder="······" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} />
          </div>
          <div>
            <label className="label" htmlFor="rec-new">Nueva contraseña</label>
            <input id="rec-new" name="new-password" type="password" autoComplete="new-password" className="field" value={next} onChange={(e) => setNext(e.target.value)} />
          </div>
          <div>
            <label className="label" htmlFor="rec-again">Repite la contraseña</label>
            <input id="rec-again" name="confirm-password" type="password" autoComplete="new-password" className="field" value={again} onChange={(e) => setAgain(e.target.value)} />
          </div>
          <ul className="space-y-1 text-sm" aria-label="Requisitos de la contraseña">
            {[...checks, { ok: again.length > 0 && next === again, text: 'Las contraseñas coinciden' }].map((c) => (
              <li key={c.text} className={`flex items-center gap-2 ${c.ok ? 'text-ok-ink' : 'text-ink-mute'}`}>
                {c.ok ? <Check className="h-4 w-4" /> : <Circle className="h-4 w-4" />} {c.text}
              </li>
            ))}
          </ul>
          <button className="btn-primary w-full" disabled={busy || !CODE_RE.test(code) || !passwordOk}>
            {busy ? <Spinner className="h-5 w-5" /> : 'Cambiar contraseña'}
          </button>

          {captchaOn && <Turnstile ref={captcha} siteKey={auth!.captcha.siteKey!} onToken={setCaptchaToken} />}
          <div className="flex items-center justify-between text-sm">
            <button type="button" className="font-semibold text-brand underline disabled:cursor-not-allowed disabled:opacity-50 disabled:no-underline"
              disabled={busy || cooldown > 0 || (captchaOn && !captchaToken)} onClick={() => sendCode()}>
              {cooldown > 0 ? `Reenviar código (${cooldown} s)` : 'Reenviar código'}
            </button>
            <button type="button" className="text-ink-soft underline" onClick={() => { setStep('email'); setCode(''); setNext(''); setAgain(''); }}>
              Usar otro correo
            </button>
          </div>
        </form>
      )}

      <Link to="/login" className="block text-center text-sm text-brand">Volver a iniciar sesión</Link>
      <Notifications />
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto flex min-h-full max-w-md items-center p-6">
      <div className="card animate-rise w-full space-y-5 p-7">{children}</div>
    </main>
  );
}
