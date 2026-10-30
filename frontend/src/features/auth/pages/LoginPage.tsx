import { Clock, Eye, EyeOff, ShieldCheck } from 'lucide-react';
import { FormEvent, useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { ApiError } from '@/shared/api/http';
import { config } from '@/shared/config';
import { ErrorNote, Spinner } from '@/shared/ui/primitives';
import { useSession } from '../store/session';

const FRIENDLY: Record<string, string> = {
  INVALID_CREDENTIALS: 'Correo o contraseña incorrectos, o la cuenta está bloqueada temporalmente.',
  NETWORK: 'No se pudo conectar con el servidor. Revisa tu conexión e inténtalo de nuevo.',
};

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
    <main className="flex min-h-full flex-col items-center justify-center gap-10 bg-paper px-5 py-10 lg:flex-row lg:gap-20">
      <div className="max-w-md text-center lg:text-left">
        <div className="mb-4 flex items-center justify-center gap-3 lg:justify-start">
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-brand text-white"><ShieldCheck className="h-8 w-8" /></span>
          <span className="text-5xl font-extrabold tracking-tight text-brand">SisDoc</span>
        </div>
        <h1 className="text-2xl font-medium leading-snug text-ink lg:text-[28px]">
          Conecta con tu equipo, comparte documentos y mantén todo bajo control.
        </h1>
      </div>

      <div className="w-full max-w-[400px]">
        <div className="card p-5 shadow-pop">
          {pending ? (
            <div className="space-y-4 p-1" role="status">
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-amber-soft text-amber"><Clock className="h-6 w-6" /></span>
              <h2 className="text-xl">Dispositivo pendiente de autorización</h2>
              <p className="text-sm leading-relaxed text-ink-soft">
                Tus credenciales son correctas, pero este equipo es nuevo. Un administrador debe aprobarlo antes de que puedas entrar.
                Avísale que estás esperando y vuelve a intentarlo.
              </p>
              <button className="btn-primary w-full" onClick={() => setPending(false)}>Volver a intentar</button>
            </div>
          ) : (
            <form onSubmit={submit} className="space-y-3" noValidate>
              <h2 className="sr-only">Iniciar sesión</h2>
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
              <button className="btn-primary w-full !py-3 text-lg" disabled={busy || !email || !password}>
                {busy ? <Spinner className="h-5 w-5" /> : 'Entrar'}
              </button>
              <p className="pt-1 text-center text-sm text-brand">¿Olvidaste tu contraseña? <span className="text-ink-mute">(próximamente)</span></p>
              <hr className="border-line" />
              <p className="flex items-center justify-center gap-2 text-center text-xs text-ink-mute">
                <Clock className="h-3.5 w-3.5" /> Por seguridad, la sesión se cierra tras 30 min sin actividad.
              </p>
            </form>
          )}
        </div>

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
    </main>
  );
}
