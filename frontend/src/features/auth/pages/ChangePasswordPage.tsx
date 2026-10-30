import { Check, Circle } from 'lucide-react';
import { FormEvent, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ApiError } from '@/shared/api/http';
import { ErrorNote, Spinner } from '@/shared/ui/primitives';
import { authApi } from '../api/auth.api';
import { useSession } from '../store/session';

const COMMON = ['password1234', '123456789012', 'qwertyuiop12', 'changeme1234'];

/** Mismas reglas que el backend (domain/password-policy.ts). El servidor siempre vuelve a validar. */
function rules(pw: string, email: string) {
  const local = email.split('@')[0].toLowerCase();
  return [
    { ok: pw.length >= 12, text: 'Al menos 12 caracteres' },
    { ok: pw.length > 0 && !COMMON.includes(pw.toLowerCase()), text: 'No es una contraseña común' },
    { ok: pw.length > 0 && !(local.length >= 3 && pw.toLowerCase().includes(local)), text: 'No contiene tu correo' },
  ];
}

export function ChangePasswordPage() {
  const { user, passwordChanged } = useSession();
  const navigate = useNavigate();
  const forced = user?.mustChangePassword ?? false;

  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [again, setAgain] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const checks = rules(next, user?.email ?? '');
  const valid = checks.every((c) => c.ok) && next === again && current.length > 0;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      await authApi.changePassword(current, next);
      passwordChanged();
      navigate('/inicio', { replace: true });
    } catch (err) {
      setError((err as ApiError).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto flex min-h-full max-w-md items-center p-6">
      <form onSubmit={submit} className="card animate-rise w-full space-y-5 p-7">
        <div>
          <h1 className="text-2xl">{forced ? 'Crea tu contraseña' : 'Cambiar contraseña'}</h1>
          <p className="mt-1 text-sm text-ink-soft">
            {forced ? 'Por seguridad, debes reemplazar la contraseña temporal antes de continuar.' : 'Al cambiarla se cerrarán tus otras sesiones.'}
          </p>
        </div>
        <ErrorNote message={error} />
        <div>
          <label className="label" htmlFor="cur">Contraseña actual</label>
          <input id="cur" type="password" autoComplete="current-password" className="field" value={current} onChange={(e) => setCurrent(e.target.value)} />
        </div>
        <div>
          <label className="label" htmlFor="new">Nueva contraseña</label>
          <input id="new" type="password" autoComplete="new-password" className="field" value={next} onChange={(e) => setNext(e.target.value)} />
          <ul className="mt-3 space-y-1.5" aria-label="Requisitos">
            {checks.map((c) => (
              <li key={c.text} className={`flex items-center gap-2 text-sm ${c.ok ? 'text-brand' : 'text-ink-mute'}`}>
                {c.ok ? <Check className="h-4 w-4" /> : <Circle className="h-4 w-4" />} {c.text}
              </li>
            ))}
          </ul>
        </div>
        <div>
          <label className="label" htmlFor="again">Repite la nueva contraseña</label>
          <input id="again" type="password" autoComplete="new-password" className="field" value={again} onChange={(e) => setAgain(e.target.value)} />
          {again && next !== again && <p className="mt-1.5 text-sm text-danger">Las contraseñas no coinciden</p>}
        </div>
        <button className="btn-primary w-full" disabled={!valid || busy}>{busy ? <Spinner className="h-4 w-4" /> : 'Guardar contraseña'}</button>
      </form>
    </div>
  );
}
