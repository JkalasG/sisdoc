import { FlaskConical, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useSession } from '@/features/auth/store/session';

type Controls = typeof import('@/shared/api/mock/router')['mockControls'];

/**
 * Panel flotante SOLO en modo mock. Permite provocar los estados difíciles de ver
 * (token vencido, dispositivo nuevo, servidor caído…) para revisar el diseño de cada uno.
 */
export function DemoPanel() {
  const [open, setOpen] = useState(false);
  const [c, setC] = useState<Controls | null>(null);
  const [, bump] = useState(0);
  const qc = useQueryClient();
  const refresh = () => bump((n) => n + 1);

  useEffect(() => { import('@/shared/api/mock/router').then((m) => setC(m.mockControls)); }, []);
  if (!c) return null;
  const s = c.state.scenario;

  const Row = ({ label, hint, on, off }: { label: string; hint: string; on?: boolean; off: () => void }) => (
    <button onClick={() => { off(); refresh(); }} className="flex w-full items-start justify-between gap-3 rounded-xl p-2.5 text-left hover:bg-paper">
      <span><span className="block text-sm font-semibold">{label}</span><span className="text-xs text-ink-mute">{hint}</span></span>
      {on !== undefined && <span className={`mt-0.5 shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold ${on ? 'bg-amber text-white' : 'bg-paper text-ink-mute'}`}>{on ? 'ON' : 'OFF'}</span>}
    </button>
  );

  return (
    <div className="fixed bottom-24 right-4 z-[60] flex flex-col items-end md:bottom-4">
      {open && (
        <div className="card mb-3 w-80 max-w-[calc(100vw-2rem)] p-3 shadow-pop" role="dialog" aria-label="Panel de demostración">
          <div className="mb-1 flex items-center justify-between px-2.5 pt-1">
            <p className="font-display text-lg">Panel de demostración</p>
            <button onClick={() => setOpen(false)} aria-label="Cerrar panel" className="rounded-lg p-1 hover:bg-paper"><X className="h-4 w-4" /></button>
          </div>
          <Row label="Simular dispositivo nuevo" hint="El próximo login queda «pendiente de autorización»" on={!s.deviceKnown}
            off={() => c.set({ deviceKnown: !s.deviceKnown })} />
          <Row label="Aprobar dispositivo" hint="Como si el administrador lo autorizara" off={() => c.approveDevices()} />
          <Row label="Bloquear dispositivo" hint="Expulsa la sesión y rechaza nuevos ingresos" on={s.deviceBlocked}
            off={() => { c.blockDevice(); useSession.getState().logout(); }} />
          <Row label="Límite de 3 sesiones" hint="El próximo login responde «ya tienes 3 sesiones»" on={s.sessionLimit} off={() => c.set({ sessionLimit: !s.sessionLimit })} />
          <Row label="Vencer token de acceso" hint="Verás la renovación silenciosa (refresh)" off={() => { c.expireAccessToken(); qc.invalidateQueries(); }} />
          <Row label="Avanzar 31 min de inactividad" hint="La sesión del servidor expira" off={() => { c.advanceTime(31 * 60_000); qc.invalidateQueries(); }} />
          <Row label="Servidor caído" hint="Todas las peticiones fallan (sin conexión)" on={s.serverDown} off={() => { c.set({ serverDown: !s.serverDown }); qc.invalidateQueries(); }} />
          <Row label="Restablecer datos de demo" hint="Borra cambios y vuelve al estado inicial" off={() => { c.reset(); useSession.getState().logout(); qc.clear(); }} />
        </div>
      )}
      <button onClick={() => setOpen((o) => !o)} className="flex h-12 w-12 items-center justify-center rounded-full bg-amber text-white shadow-pop transition hover:scale-105" aria-label="Abrir panel de demostración" aria-expanded={open}>
        <FlaskConical className="h-5 w-5" />
      </button>
    </div>
  );
}
