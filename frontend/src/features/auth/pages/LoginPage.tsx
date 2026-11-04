import { Clock, Eye, EyeOff, ShieldAlert } from 'lucide-react';
import { FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { ApiError } from '@/shared/api/http';
import type { AuthConfig } from '@/shared/api/types';
import { config } from '@/shared/config';
import { notify, Notifications, useNotify } from '@/shared/ui/notify';
import { Spinner, Toaster } from '@/shared/ui/primitives';
import { authApi } from '../api/auth.api';
import { GoogleSignInButton } from '../components/GoogleSignInButton';
import { Turnstile, TurnstileHandle } from '../components/Turnstile';
import { useSession } from '../store/session';

const FRIENDLY: Record<string, string> = {
  INVALID_CREDENTIALS: 'Correo o contraseña incorrectos, o la cuenta está bloqueada temporalmente.',
  NETWORK: 'No se pudo conectar con el servidor. Revisa tu conexión e inténtalo de nuevo.',
  CAPTCHA_FAILED: 'No se pudo comprobar la verificación de seguridad. Inténtalo de nuevo.',
  GOOGLE_DISABLED: 'El acceso con Google no está habilitado.',
};

const ARCS = ['#FF4D8D', '#FF9F43', '#FFD93D', '#4ADE80', '#38BDF8', '#8B5CF6'];

/** Panel de marca: degradado azul con arcos de arcoíris (mismo diseño del banner de redes). */
function Hero() {
  return (
    <section className="relative flex flex-col justify-center overflow-hidden px-8 py-10 text-white lg:px-16 lg:py-0"
      style={{ background: 'linear-gradient(135deg,#0B1B4D 0%,#2F3FD6 60%,#7C4DFF 100%)' }}>
      <div aria-hidden="true" className="pointer-events-none absolute inset-0"
        style={{ background: 'radial-gradient(circle at 80% 20%, rgba(255,77,141,.45), rgba(255,77,141,0) 60%)' }} />
      <svg aria-hidden="true" viewBox="0 0 1200 630" preserveAspectRatio="xMidYMax slice" className="pointer-events-none absolute inset-0 h-full w-full">
        {ARCS.map((c, i) => {
          const r = 120 + i * 60;
          return <path key={c} d={`M${600 - r} 700a${r} ${r} 0 0 1 ${2 * r} 0`} fill="none" stroke={c} strokeWidth="26" strokeOpacity=".28" />;
        })}
      </svg>
      <div className="relative">
        <h1><img src="/images/logo-iris-blanco.svg" alt="Iris" className="h-20 w-auto lg:h-32" /></h1>
        <p className="mt-6 max-w-md text-2xl font-bold leading-snug lg:text-4xl">
          Envía, conversa y revisa en un solo lugar.
        </p>
        <ul className="mt-6 hidden gap-2 text-sm font-semibold lg:flex" aria-label="Qué puedes hacer en Iris">
          {['Documentos seguros', 'Mensajes directos', 'Revisiones con trazabilidad'].map((t) => (
            <li key={t} className="rounded-full bg-white/15 px-3.5 py-1.5 ring-1 ring-white/25">{t}</li>
          ))}
        </ul>
      </div>
    </section>
  );
}

export function LoginPage() {
  const { status, user, notice, login, loginWithGoogle, clearNotice } = useSession();
  const navigate = useNavigate();
  const from = (useLocation().state as { from?: string } | null)?.from ?? '/inicio';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const emailInput = useRef<HTMLInputElement>(null);
  const passwordInput = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState(false);
  // Avisos del sistema (sesión expirada, cierre por inactividad): salen como notificación y se consumen.
  useEffect(() => { if (notice) { notify.warning(notice); clearNotice(); } }, [notice, clearNotice]);
  useEffect(() => () => useNotify.getState().clear(), []);
  const [inactive, setInactive] = useState(false); // se registró con Google y un administrador aún no activa su cuenta

  // El servidor decide qué verificaciones hay (backend/.env). Mientras no responda, no se puede enviar el formulario.
  const [auth, setAuth] = useState<AuthConfig | null>(null);
  const [authError, setAuthError] = useState(false);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const captcha = useRef<TurnstileHandle>(null);
  const loadConfig = useCallback(() => {
    setAuthError(false);
    authApi.config().then(setAuth).catch(() => setAuthError(true));
  }, []);
  useEffect(loadConfig, [loadConfig]);
  const captchaOn = auth?.captcha.enabled === true && !!auth.captcha.siteKey;
  const googleOn = auth?.google.enabled === true && !!auth.google.clientId;

  if (status === 'authed') return <Navigate to={user?.mustChangePassword ? '/cambiar-clave' : from} replace />;

  async function submit(e: FormEvent) {
    e.preventDefault();
    // El autocompletado del navegador rellena los campos SIN avisar a la página hasta que el usuario interactúa.
    // Por eso los campos no son controlados (React no los sobrescribe al repintar) y se leen del formulario al enviar.
    const form = new FormData(e.currentTarget as HTMLFormElement);
    const mail = String(form.get('email') ?? email).trim();
    const pass = String(form.get('password') ?? password);
    if (!mail || !pass) { notify.error('Ingresa tu correo y tu contraseña.'); return; }
    setBusy(true); clearNotice();
    try {
      const outcome = await login(mail, pass, captchaOn ? captchaToken ?? undefined : undefined);
      finish(outcome);
    } catch (err) {
      fail(err);
    } finally {
      setBusy(false);
    }
  }

  async function submitGoogle(idToken: string) {
    setBusy(true); clearNotice();
    try {
      finish(await loginWithGoogle(idToken));
    } catch (err) {
      fail(err, false); // Google no usa el captcha: su token sigue siendo válido
    } finally {
      setBusy(false);
    }
  }

  function finish(outcome: 'OK' | 'DEVICE_PENDING') {
    if (outcome === 'DEVICE_PENDING') setPending(true);
    else navigate(from, { replace: true });
  }

  function fail(err: unknown, usedCaptcha = true) {
    const api = err as ApiError;
    // La cuenta sin activar se explica en su propio panel; avisarlo también arriba sería repetirlo.
    if (api.code === 'ACCOUNT_PENDING_ACTIVATION') setInactive(true);
    else notify.error(FRIENDLY[api.code] ?? api.message);
    if (usedCaptcha) captcha.current?.reset(); // el token de un intento con contraseña sirve una sola vez
  }

  return (
    <main className="grid min-h-full lg:grid-cols-[1.15fr_1fr]">
      <Hero />

      <section className="flex items-center justify-center bg-paper px-5 py-10">
        <div className="w-full max-w-[400px]">
          {inactive ? (
            <div className="card space-y-4 p-6" role="alert">
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-amber-soft text-amber"><ShieldAlert className="h-6 w-6" /></span>
              <h2 className="text-xl">Tu cuenta aún no está activada</h2>
              <p className="text-sm leading-relaxed text-ink-soft">
                Te registraste con Google, pero un administrador debe activar tu cuenta antes de que puedas entrar.
                Contacta a un administrador para que la active y vuelve a intentarlo.
              </p>
              <button className="btn-primary w-full" onClick={() => setInactive(false)}>Entendido</button>
            </div>
          ) : pending ? (
            <div className="card space-y-4 p-6" role="status">
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-amber-soft text-amber"><Clock className="h-6 w-6" /></span>
              <h2 className="text-xl">Dispositivo pendiente de autorización</h2>
              <p className="text-sm leading-relaxed text-ink-soft">
                Tus credenciales son correctas, pero este equipo es nuevo. Un administrador debe aprobarlo antes de que puedas entrar.
                Avísale que estás esperando y vuelve a intentarlo.
              </p>
              <button className="btn-primary w-full" onClick={() => setPending(false)}>Volver a intentar</button>
            </div>
          ) : (
            <>
              <div className="mb-6">
                <h2 className="text-3xl font-extrabold tracking-tight">Iniciar sesión</h2>
                <p className="mt-1 text-sm text-ink-soft">Ingresa con tu cuenta institucional.</p>
              </div>
              <form onSubmit={submit} className="space-y-3" noValidate>
                <div>
                  <label className="sr-only" htmlFor="email">Correo</label>
                  <input id="email" name="email" type="email" autoComplete="username" required className="field !py-3.5" placeholder="Correo institucional"
                    ref={emailInput} defaultValue={email} onChange={(e) => setEmail(e.target.value)} />
                </div>
                <div className="relative">
                  <label className="sr-only" htmlFor="password">Contraseña</label>
                  <input id="password" name="password" type={show ? 'text' : 'password'} autoComplete="current-password" required className="field !py-3.5 pr-11" placeholder="Contraseña"
                    ref={passwordInput} defaultValue={password} onChange={(e) => setPassword(e.target.value)} />
                  <button type="button" onClick={() => setShow((s) => !s)} aria-label={show ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-2 text-ink-mute hover:bg-paper">
                    {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                {authError && (
                  <p role="alert" className="text-sm text-danger">
                    No se pudo cargar la configuración de acceso.{' '}
                    <button type="button" className="font-semibold underline" onClick={loadConfig}>Reintentar</button>
                  </p>
                )}
                {captchaOn && <Turnstile ref={captcha} siteKey={auth!.captcha.siteKey!} onToken={setCaptchaToken} />}
                <button className="btn-primary w-full !py-3 text-lg"
                  disabled={busy || !auth || (captchaOn && !captchaToken)}>
                  {busy ? <Spinner className="h-5 w-5" /> : 'Entrar'}
                </button>
                {auth?.passwordReset.enabled && (
                  <p className="text-center text-sm"><Link to="/recuperar" className="text-brand underline">¿Olvidaste tu contraseña?</Link></p>
                )}

                {googleOn && (
                  <>
                    <div className="flex items-center gap-3 py-1 text-xs uppercase tracking-wide text-ink-mute" aria-hidden="true">
                      <span className="h-px flex-1 bg-line" />o<span className="h-px flex-1 bg-line" />
                    </div>
                    <GoogleSignInButton clientId={auth!.google.clientId!} onCredential={submitGoogle} disabled={busy} />
                  </>
                )}

                <p className="flex items-center justify-center gap-2 pt-2 text-center text-xs text-ink-mute">
                  <Clock className="h-3.5 w-3.5" /> Por seguridad, la sesión se cierra tras 30 min sin actividad.
                </p>
              </form>
            </>
          )}

          {config.useMocks && !pending && !inactive && (
            <div className="mt-4 rounded-xl border border-dashed border-amber/60 bg-amber-soft p-3.5 text-xs leading-relaxed text-amber-ink">
              <strong>Modo demostración.</strong> Sin servidor. Prueba con <code>ana@empresa.com</code> / <code>Clave-Segura-2026</code>.
              Administrador: <code>admin@empresa.com</code> / <code>Clave-Segura-2026</code>. Cambio obligatorio de clave: <code>nueva@empresa.com</code> / <code>Temporal-Clave-2026</code>.
              <button type="button" className="mt-2 block font-semibold underline"
                onClick={() => {
                  setEmail('ana@empresa.com'); setPassword('Clave-Segura-2026');
                  if (emailInput.current) emailInput.current.value = 'ana@empresa.com';
                  if (passwordInput.current) passwordInput.current.value = 'Clave-Segura-2026';
                }}>
                Rellenar datos de Ana
              </button>
            </div>
          )}
        </div>
      </section>
      <Toaster />
      <Notifications />
    </main>
  );
}
