import { useEffect, useRef, useState } from 'react';
import { loadScript } from '@/shared/lib/load-script';

interface GoogleIdApi {
  initialize(cfg: { client_id: string; callback: (r: { credential?: string }) => void; ux_mode?: string }): void;
  renderButton(el: HTMLElement, opts: Record<string, unknown>): void;
}
declare global {
  interface Window { google?: { accounts: { id: GoogleIdApi } } }
}

const SRC = 'https://accounts.google.com/gsi/client';

/** Botón oficial "Continuar con Google". Entrega la credencial (ID token) al padre; el servidor la valida. */
export function GoogleSignInButton({ clientId, onCredential, disabled }: {
  clientId: string; onCredential: (idToken: string) => void; disabled?: boolean;
}) {
  const box = useRef<HTMLDivElement>(null);
  const cb = useRef(onCredential);
  cb.current = onCredential;
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setFailed(false);
    (window.google?.accounts?.id ? Promise.resolve() : loadScript(SRC))
      .then(() => {
        const id = window.google?.accounts?.id;
        if (cancelled || !box.current || !id) return;
        id.initialize({ client_id: clientId, callback: (r) => { if (r.credential) cb.current(r.credential); }, ux_mode: 'popup' });
        id.renderButton(box.current, {
          type: 'standard', theme: 'outline', size: 'large', text: 'continue_with', shape: 'rectangular', locale: 'es',
          width: Math.min(400, Math.max(200, box.current.offsetWidth || 400)),
        });
      })
      .catch(() => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; };
  }, [clientId]);

  return (
    <div className={disabled ? 'pointer-events-none opacity-60' : undefined} aria-disabled={disabled}>
      <div ref={box} data-testid="google-button" className="flex min-h-[44px] justify-center" />
      {failed && (
        <p role="alert" className="mt-1 text-center text-sm text-danger">
          No se pudo cargar el acceso con Google. Revisa tu conexión y recarga la página.
        </p>
      )}
    </div>
  );
}
