import { AlertTriangle, CheckCircle2, Info, X, XCircle } from 'lucide-react';
import { create } from 'zustand';

export type NotifyKind = 'error' | 'warning' | 'success' | 'info';
interface Item { id: number; kind: NotifyKind; message: string }
interface NotifyState {
  items: Item[];
  push: (kind: NotifyKind, message: string) => void;
  dismiss: (id: number) => void;
  clear: () => void;
}

const LIFETIME_MS = 7000;
const MAX_VISIBLE = 4;
let seq = 0;
const timers = new Map<number, ReturnType<typeof setTimeout>>();

const stop = (id: number) => { clearTimeout(timers.get(id)); timers.delete(id); };

export const useNotify = create<NotifyState>((set, get) => ({
  items: [],
  push(kind, message) {
    // El mismo aviso repetido (p. ej. contraseña errónea dos veces) no se apila: se renueva.
    const same = get().items.find((i) => i.kind === kind && i.message === message);
    if (same) get().dismiss(same.id);
    const id = ++seq;
    const kept = get().items.slice(-(MAX_VISIBLE - 1));
    get().items.filter((i) => !kept.includes(i)).forEach((i) => stop(i.id));
    set({ items: [...kept, { id, kind, message }] });
    timers.set(id, setTimeout(() => get().dismiss(id), LIFETIME_MS));
  },
  dismiss(id) {
    stop(id);
    set({ items: get().items.filter((i) => i.id !== id) });
  },
  clear() {
    timers.forEach((t) => clearTimeout(t));
    timers.clear();
    set({ items: [] });
  },
}));

/** Avisos en la esquina superior derecha (errores, advertencias, éxito, información). */
export const notify = {
  error: (message: string) => useNotify.getState().push('error', message),
  warning: (message: string) => useNotify.getState().push('warning', message),
  success: (message: string) => useNotify.getState().push('success', message),
  info: (message: string) => useNotify.getState().push('info', message),
};

const STYLE: Record<NotifyKind, { box: string; icon: JSX.Element; title: string }> = {
  error: { box: 'border-danger/40 bg-danger-soft text-danger', icon: <XCircle className="h-5 w-5" />, title: 'Error' },
  warning: { box: 'border-amber/50 bg-amber-soft text-amber-ink', icon: <AlertTriangle className="h-5 w-5" />, title: 'Atención' },
  success: { box: 'border-ok/40 bg-ok-soft text-ok-ink', icon: <CheckCircle2 className="h-5 w-5" />, title: 'Listo' },
  info: { box: 'border-brand/40 bg-surface text-ink', icon: <Info className="h-5 w-5 text-brand" />, title: 'Información' },
};

/** Se monta una vez por pantalla que quiera mostrar avisos. */
export function Notifications() {
  const items = useNotify((s) => s.items);
  const dismiss = useNotify((s) => s.dismiss);
  if (!items.length) return null;
  return (
    <div className="pointer-events-none fixed right-4 top-4 z-[90] flex w-[min(92vw,380px)] flex-col gap-2.5" aria-live="polite">
      {items.map((n) => {
        const s = STYLE[n.kind];
        return (
          <div key={n.id} role="alert"
            className={`pointer-events-auto animate-notify flex items-start gap-3 rounded-xl border px-3.5 py-3 shadow-pop ${s.box}`}>
            <span className="mt-0.5 shrink-0">{s.icon}</span>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-bold uppercase tracking-wide opacity-80">{s.title}</p>
              <p className="text-sm leading-snug">{n.message}</p>
            </div>
            <button type="button" onClick={() => dismiss(n.id)} aria-label="Cerrar aviso"
              className="shrink-0 rounded-full p-1 opacity-70 hover:bg-black/5 hover:opacity-100">
              <X className="h-4 w-4" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
