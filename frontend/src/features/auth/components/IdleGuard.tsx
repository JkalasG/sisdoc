import { useEffect, useRef, useState } from 'react';
import { config } from '@/shared/config';
import { Modal } from '@/shared/ui/primitives';
import { authApi } from '../api/auth.api';
import { useSession } from '../store/session';

const EVENTS = ['mousemove', 'keydown', 'click', 'touchstart', 'scroll'] as const;
const KEEPALIVE_MS = 2 * 60_000; // avisa al servidor que sigues activo (su inactividad también cuenta 30 min)

/**
 * Cierra la sesión tras 30 min sin actividad del usuario, con aviso 1 minuto antes.
 * La actividad se reporta al servidor como máximo cada 2 min para que ambos relojes coincidan.
 */
export function IdleGuard() {
  const logout = useSession((s) => s.logout);
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  const lastActivity = useRef(Date.now());
  const lastPing = useRef(Date.now());

  useEffect(() => {
    const onActivity = () => {
      if (secondsLeft !== null) return; // con el aviso abierto, solo cuenta pulsar "Seguir conectado"
      lastActivity.current = Date.now();
      if (Date.now() - lastPing.current > KEEPALIVE_MS) {
        lastPing.current = Date.now();
        authApi.me().catch(() => undefined);
      }
    };
    EVENTS.forEach((e) => window.addEventListener(e, onActivity, { passive: true }));
    const tick = setInterval(() => {
      const idle = Date.now() - lastActivity.current;
      if (idle >= config.idleTimeoutMs) {
        logout();
        useSession.setState({ notice: 'Tu sesión se cerró por inactividad.' });
      } else if (idle >= config.idleTimeoutMs - config.idleWarningMs) {
        setSecondsLeft(Math.ceil((config.idleTimeoutMs - idle) / 1000));
      } else {
        setSecondsLeft(null);
      }
    }, 1000);
    return () => {
      EVENTS.forEach((e) => window.removeEventListener(e, onActivity));
      clearInterval(tick);
    };
  }, [logout, secondsLeft]);

  if (secondsLeft === null) return null;
  return (
    <Modal title="¿Sigues ahí?" onClose={() => undefined} dismissible={false}>
      <p className="text-sm text-ink-soft">
        Tu sesión se cerrará en <strong className="text-ink">{secondsLeft} s</strong> por inactividad.
      </p>
      <div className="mt-5 flex gap-3">
        <button className="btn-primary flex-1" onClick={() => { lastActivity.current = Date.now(); lastPing.current = Date.now(); authApi.me().catch(() => undefined); setSecondsLeft(null); }}>
          Seguir conectado
        </button>
        <button className="btn-ghost" onClick={() => logout()}>Salir</button>
      </div>
    </Modal>
  );
}
