import { Check, Clock, Eye, EyeOff } from 'lucide-react';
import { FormEvent, useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { ApiError } from '@/shared/api/http';
import { config } from '@/shared/config';
import { ErrorNote, Spinner, Toaster, proto } from '@/shared/ui/primitives';
import { useSession } from '../store/session';

const FRIENDLY: Record<string, string> = {
  INVALID_CREDENTIALS: 'Correo o contraseña incorrectos, o la cuenta está bloqueada temporalmente.',
  NETWORK: 'No se pudo conectar con el servidor. Revisa tu conexión e inténtalo de nuevo.',
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

function GoogleIcon() {
  return (
    <svg viewBox="0 0 48 48" className="h-5 w-5" aria-hidden="true">
      <path fill="#FFC107" d="M43.6 20.1H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 8 3l5.7-5.7C34 6.1 29.3 4 24 4 13 4 4 13 4 24s9 20 20 20 20-9 20-20c0-1.3-.1-2.6-.4-3.9z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 8 3l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.1H42V20H24v8h11.3c-.8 2.200-2.200 4.200-4.100 5.600l6.200 5.200C37 39.200 44 34 44 24c0-1.300-.1-2.600-.4-3.900z" />
    </svg>
  );
}

/** Solo visual: todavía no se conecta con Google reCAPTCHA. */
function RecaptchaMock() {
  const [checked, setChecked] = useState(false);
  return (
    <div className="flex items-center justify-between rounded-lg border border-line bg-paper px-3.5 py-3">
      <button type="button" role="checkbox" aria-checked={checked} onClick={() => setChecked((v) => !v)}
        className="flex items-center gap-3 text-sm font-medium text-ink">
        <span className={`flex h-7 w-7 items-center justify-center rounded border-2 transition ${checked ? 'border-brand bg-brand text-white' : 'border-ink-mute bg-surface'}`}>
          {checked && <Check className="h-5 w-5" strokeWidth={3} />}
        </span>
        No soy un robot
      </button>
      <div className="flex flex-col items-center text-[9px] leading-tight text-ink-mute" aria-hidden="true">
        <svg viewBox="0 0 24 24" className="h-7 w-7">
          <path fill="#1C3AA9" d="M12 2a10 10 0 0 0-8.7 5l3.4 2A6 6 0 0 1 12 6V2z" />
          <path fill="#4285F4" d="M12 2v4a6 6 0 0 1 5.2 3l3.5-2A10 10 0 0 0 12 2z" />
          <path fill="#ABABAB" d="M20.7 7l-3.5 2A6 6 0 0 1 15 17.2l2 3.5A10 10 0 0 0 20.7 7z" />
          <path fill="#ABABAB" d="M3.3 7A10 10 0 0 0 7 20.7l2-3.5A6 6 0 0 1 6.7 9L3.3 7z" />
        </svg>
        <span className="font-semibold">reCAPTCHA</span>
        <span>Privacidad · Términos</span>
      </div>
    </div>
  );
}

export function LoginPage() {
  const { status, user, notice, login, clearNotice } = useSession();
  const navigate = useNavigate();
  const from = (useLocation().state as { from?: string } | null)?.from ?? '/inicio';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  if (status === 'authed') return <Navigate to={user?.mustChangePassword ? '/cambiar-clave' : from} replace />;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null); clearNotice();
    try {
      const outcome = await login(email, password);
      if (outcome === 'DEVICE_PENDING') setPending(true);
      else navigate(from, { replace: true });
    } catch (err) {
      const api = err as ApiError;
      setError(FRIENDLY[api.code] ?? api.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="grid min-h-full lg:grid-cols-[1.15fr_1fr]">
      <Hero />

      <section className="flex items-center justify-center bg-paper px-5 py-10">
        <div className="w-full max-w-[400px]">
          {pending ? (
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
                {notice && <p role="status" className="rounded-lg bg-amber-soft px-3.5 py-2.5 text-sm text-amber-ink">{notice}</p>}
                <ErrorNote message={error} />
                <div>
                  <label className="sr-only" htmlFor="email">Correo</label>
                  <input id="email" type="email" autoComplete="username" required className="field !py-3.5" placeholder="Correo institucional"
                    value={email} onChange={(e) => setEmail(e.target.value)} />
                </div>
                <div className="relative">
                  <label className="sr-only" htmlFor="password">Contraseña</label>
                  <input id="password" type={show ? 'text' : 'password'} autoComplete="current-password" required className="field !py-3.5 pr-11" placeholder="Contraseña"
                    value={password} onChange={(e) => setPassword(e.target.value)} />
                  <button type="button" onClick={() => setShow((s) => !s)} aria-label={show ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-2 text-ink-mute hover:bg-paper">
                    {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                <RecaptchaMock />
                <button className="btn-primary w-full !py-3 text-lg" disabled={busy || !email || !password}>
                  {busy ? <Spinner className="h-5 w-5" /> : 'Entrar'}
                </button>
                <p className="text-center text-sm text-brand">¿Olvidaste tu contraseña? <span className="text-ink-mute">(próximamente)</span></p>

                <div className="flex items-center gap-3 py-1 text-xs uppercase tracking-wide text-ink-mute" aria-hidden="true">
                  <span className="h-px flex-1 bg-line" />o<span className="h-px flex-1 bg-line" />
                </div>
                <button type="button" onClick={() => proto('El acceso con Google')}
                  className="flex w-full items-center justify-center gap-3 rounded-lg border border-line bg-surface px-4 py-3 text-[15px] font-semibold text-ink transition hover:bg-paper">
                  <GoogleIcon /> Continuar con Google
                </button>

                <p className="flex items-center justify-center gap-2 pt-2 text-center text-xs text-ink-mute">
                  <Clock className="h-3.5 w-3.5" /> Por seguridad, la sesión se cierra tras 30 min sin actividad.
                </p>
              </form>
            </>
          )}

          {config.useMocks && !pending && (
            <div className="mt-4 rounded-xl border border-dashed border-amber/60 bg-amber-soft p-3.5 text-xs leading-relaxed text-amber-ink">
              <strong>Modo demostración.</strong> Sin servidor. Prueba con <code>ana@empresa.com</code> / <code>Clave-Segura-2026</code>.
              Administrador: <code>admin@empresa.com</code> / <code>Clave-Segura-2026</code>. Cambio obligatorio de clave: <code>nueva@empresa.com</code> / <code>Temporal-Clave-2026</code>.
              <button type="button" className="mt-2 block font-semibold underline"
                onClick={() => { setEmail('ana@empresa.com'); setPassword('Clave-Segura-2026'); }}>
                Rellenar datos de Ana
              </button>
            </div>
          )}
        </div>
      </section>
      <Toaster />
    </main>
  );
}
