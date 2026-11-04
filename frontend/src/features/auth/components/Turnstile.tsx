import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { loadScript } from '@/shared/lib/load-script';

interface TurnstileApi {
  render(el: HTMLElement, opts: Record<string, unknown>): string;
  reset(id?: string): void;
  remove(id?: string): void;
}
declare global {
  interface Window { turnstile?: TurnstileApi }
}

export interface TurnstileHandle { reset(): void }

const SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';

/** Traduce el código de error de Cloudflare a algo que se pueda corregir. */
export function turnstileProblem(code: string | number | undefined): string {
  const c = String(code ?? '');
  if (c.startsWith('1102')) return `Este dominio (${window.location.hostname}) no está autorizado en tu widget de Turnstile. Agrégalo en el panel de Cloudflare (código ${c}).`;
  if (c.startsWith('1101') || c.startsWith('1100') || c === '400020') return `La clave pública de Turnstile no es válida (código ${c}). Revisa TURNSTILE_SITE_KEY.`;
  return `No se pudo completar la verificación de seguridad${c ? ` (código ${c})` : ''}. Reintenta; si persiste, revisa tu conexión, bloqueadores o la hora del equipo.`;
}

/** Widget de Cloudflare Turnstile. `onToken(null)` cuando el token vence o falla: el botón de entrar vuelve a bloquearse. */
export const Turnstile = forwardRef<TurnstileHandle, { siteKey: string; onToken: (token: string | null) => void }>(
  function Turnstile({ siteKey, onToken }, ref) {
    const box = useRef<HTMLDivElement>(null);
    const widget = useRef<string | undefined>(undefined);
    const cb = useRef(onToken);
    cb.current = onToken;
    const [failed, setFailed] = useState(false);
    const [problem, setProblem] = useState<string | null>(null);

    useImperativeHandle(ref, () => ({
      reset() { setProblem(null); cb.current(null); if (window.turnstile && widget.current !== undefined) window.turnstile.reset(widget.current); },
    }), []);

    useEffect(() => {
      let cancelled = false;
      setFailed(false);
      (window.turnstile ? Promise.resolve() : loadScript(SRC))
        .then(() => {
          if (cancelled || !box.current || !window.turnstile) return;
          widget.current = window.turnstile.render(box.current, {
            sitekey: siteKey,
            language: 'es',
            callback: (t: string) => { setProblem(null); cb.current(t); },
            'expired-callback': () => cb.current(null),
            'error-callback': (code?: string | number) => { setProblem(turnstileProblem(code)); cb.current(null); return true; },
          });
        })
        .catch(() => { if (!cancelled) setFailed(true); });
      return () => {
        cancelled = true;
        if (window.turnstile && widget.current !== undefined) window.turnstile.remove(widget.current);
        widget.current = undefined;
      };
    }, [siteKey]);

    return (
      <div>
        <div ref={box} data-testid="captcha-widget" />
        {problem && (
          <p role="alert" className="mt-1 text-sm text-danger">
            {problem}{' '}
            <button type="button" className="font-semibold underline"
              onClick={() => { setProblem(null); if (window.turnstile && widget.current !== undefined) window.turnstile.reset(widget.current); }}>Reintentar</button>
          </p>
        )}
        {failed && (
          <p role="alert" className="text-sm text-danger">
            No se pudo cargar la verificación de seguridad. Revisa tu conexión y recarga la página.
          </p>
        )}
      </div>
    );
  },
);
