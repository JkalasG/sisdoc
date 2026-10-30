import { Calendar, ChevronLeft, ChevronRight } from 'lucide-react';
import { CSSProperties, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

/**
 * Selector de fecha y hora: liviano (sin dependencias), con el diseño y el modo oscuro de la app.
 * El valor viaja como ISO 8601 (UTC); en pantalla se muestra y edita en hora local.
 */
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const DIAS = ['L', 'M', 'X', 'J', 'V', 'S', 'D']; // la semana empieza en lunes

const pad = (n: number) => String(n).padStart(2, '0');
const mismoDia = (a: Date, b: Date) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
export const formatFechaHora = (d: Date) => `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;

interface Props {
  value: string;                       // ISO
  onChange: (iso: string) => void;
  max?: Date;                          // no se puede elegir nada posterior (p. ej. «ahora»)
  id?: string;
  required?: boolean;
}

export function DateTimeField({ value, onChange, max, id, required }: Props) {
  const auto = useId();
  const fieldId = id ?? auto;
  const selected = useMemo(() => new Date(value), [value]);
  const valido = !Number.isNaN(selected.getTime());
  const [open, setOpen] = useState(false);
  const [view, setView] = useState(() => new Date(valido ? selected : Date.now()));
  const root = useRef<HTMLDivElement>(null);
  const pop = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<CSSProperties>({});

  useEffect(() => {
    if (!open) return;
    const out = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!root.current?.contains(t) && !pop.current?.contains(t)) setOpen(false);
    };
    const cerrar = () => setOpen(false); // al desplazar o redimensionar, el calendario se cierra (no queda flotando)
    // En fase de captura: Escape cierra SOLO el calendario y no llega al modal que lo contiene.
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); setOpen(false); } };
    document.addEventListener('mousedown', out);
    document.addEventListener('keydown', esc, true);
    const alDesplazar = (e: Event) => { if (!pop.current?.contains(e.target as Node)) cerrar(); };
    window.addEventListener('resize', cerrar);
    window.addEventListener('scroll', alDesplazar, true);
    return () => {
      document.removeEventListener('mousedown', out); document.removeEventListener('keydown', esc, true);
      window.removeEventListener('resize', cerrar);
      window.removeEventListener('scroll', alDesplazar, true);
    };
  }, [open]);

  // El calendario va en un portal (no lo recorta el formulario que lo contiene). Se abre hacia el lado con más
  // espacio libre y, si aun así no cabe, limita su alto y se desplaza por dentro: nunca queda cortado por la pantalla.
  useLayoutEffect(() => {
    if (!open || !root.current) return;
    const r = root.current.getBoundingClientRect();
    const ALTO = 372, ANCHO = 288, MARGEN = 10;
    const abajo = window.innerHeight - r.bottom - MARGEN;
    const arriba = r.top - MARGEN;
    const haciaArriba = abajo < ALTO && arriba > abajo;
    const left = Math.max(8, Math.min(r.left, window.innerWidth - ANCHO - 8));
    const maxHeight = Math.max(160, Math.min(ALTO, haciaArriba ? arriba : abajo));
    setPos(haciaArriba
      ? { position: 'fixed', left, bottom: window.innerHeight - r.top + 6, maxHeight, overflowY: 'auto' }
      : { position: 'fixed', left, top: r.bottom + 6, maxHeight, overflowY: 'auto' });
  }, [open]);

  const clamp = (d: Date) => (max && d.getTime() > max.getTime() ? new Date(max) : d);
  const emit = (d: Date) => onChange(clamp(d).toISOString());

  function pickDay(day: Date) {
    const base = valido ? selected : new Date();
    emit(new Date(day.getFullYear(), day.getMonth(), day.getDate(), base.getHours(), base.getMinutes()));
  }
  function setTime(h: number, m: number) {
    const base = valido ? selected : new Date();
    emit(new Date(base.getFullYear(), base.getMonth(), base.getDate(), Math.min(23, Math.max(0, h)), Math.min(59, Math.max(0, m))));
  }

  // 6 semanas fijas para que el calendario no cambie de alto al navegar
  const celdas = useMemo(() => {
    const first = new Date(view.getFullYear(), view.getMonth(), 1);
    const offset = (first.getDay() + 6) % 7;
    return Array.from({ length: 42 }, (_, i) => new Date(first.getFullYear(), first.getMonth(), 1 - offset + i));
  }, [view]);

  // un día se bloquea solo si ni su primera hora (00:00) cae dentro del máximo
  const deshabilitado = (d: Date) => !!max && new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime() > max.getTime();
  const puedeAvanzar = !max || new Date(view.getFullYear(), view.getMonth() + 1, 1).getTime() <= max.getTime();
  const hoy = new Date();

  return (
    <div className="relative" ref={root}>
      <button type="button" id={fieldId} className="field flex items-center justify-between gap-2 text-left"
        aria-haspopup="dialog" aria-expanded={open} onClick={() => { if (valido) setView(new Date(selected)); setOpen((o) => !o); }}>
        <span className={valido ? '' : 'text-ink-mute'}>{valido ? formatFechaHora(selected) : 'dd/mm/aaaa hh:mm'}</span>
        <Calendar className="h-4 w-4 shrink-0 text-ink-soft" aria-hidden />
      </button>
      {required && <input tabIndex={-1} aria-hidden className="sr-only" required value={valido ? value : ''} readOnly />}

      {open && createPortal(
        <div ref={pop} role="dialog" aria-label="Calendario" style={pos} className="animate-rise z-[90] w-[288px] rounded-xl bg-surface p-3 shadow-pop ring-1 ring-line">
          <div className="mb-2 flex items-center justify-between">
            <button type="button" className="icon-btn !h-8 !w-8" aria-label="Mes anterior" onClick={() => setView(new Date(view.getFullYear(), view.getMonth() - 1, 1))}><ChevronLeft className="h-4 w-4" /></button>
            <p className="text-sm font-semibold capitalize" aria-live="polite">{MESES[view.getMonth()]} {view.getFullYear()}</p>
            <button type="button" className="icon-btn !h-8 !w-8 disabled:opacity-40" aria-label="Mes siguiente" disabled={!puedeAvanzar}
              onClick={() => setView(new Date(view.getFullYear(), view.getMonth() + 1, 1))}><ChevronRight className="h-4 w-4" /></button>
          </div>

          <div className="grid grid-cols-7 text-center text-[11px] font-semibold text-ink-mute">
            {DIAS.map((d) => <span key={d} className="py-1">{d}</span>)}
          </div>
          <div className="grid grid-cols-7 gap-y-0.5" role="grid" aria-label="Días">
            {celdas.map((d) => {
              const fuera = d.getMonth() !== view.getMonth();
              const sel = valido && mismoDia(d, selected);
              const off = deshabilitado(d);
              return (
                <button key={d.toISOString()} type="button" disabled={off} aria-pressed={sel}
                  aria-label={`${d.getDate()} de ${MESES[d.getMonth()]} de ${d.getFullYear()}`}
                  onClick={() => pickDay(d)}
                  className={`mx-auto flex h-8 w-8 items-center justify-center rounded-full text-sm transition
                    ${sel ? 'bg-brand font-semibold text-white' : mismoDia(d, hoy) ? 'font-semibold text-brand ring-1 ring-brand/40' : fuera ? 'text-ink-mute' : 'text-ink'}
                    ${off ? 'cursor-not-allowed opacity-30' : sel ? '' : 'hover:bg-paper'}`}>
                  {d.getDate()}
                </button>
              );
            })}
          </div>

          <div className="mt-2 flex items-center justify-between gap-2 border-t border-line pt-2.5">
            <div className="flex items-center gap-1.5" role="group" aria-label="Hora de creación">
              <CampoNumero label="Hora" value={(valido ? selected : new Date()).getHours()} max={23} onCommit={(h) => setTime(h, (valido ? selected : new Date()).getMinutes())} />
              <span className="font-semibold">:</span>
              <CampoNumero label="Minutos" value={(valido ? selected : new Date()).getMinutes()} max={59} onCommit={(m) => setTime((valido ? selected : new Date()).getHours(), m)} />
            </div>
            <div className="flex gap-1.5">
              <button type="button" className="btn-ghost !px-3 !py-1.5 text-sm" onClick={() => { const n = new Date(); emit(n); setView(n); }}>Ahora</button>
              <button type="button" className="btn-primary !px-3 !py-1.5 text-sm" onClick={() => setOpen(false)}>Listo</button>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}

/** Número de 2 dígitos que se puede borrar y reescribir con libertad; al salir se vuelve a formatear. */
function CampoNumero({ label, value, max, onCommit }: { label: string; value: number; max: number; onCommit: (n: number) => void }) {
  const [txt, setTxt] = useState(pad(value));
  const enfocado = useRef(false);
  useEffect(() => { if (!enfocado.current) setTxt(pad(value)); }, [value]);
  return (
    <input aria-label={label} inputMode="numeric" className="field !w-14 !px-2 !py-1.5 text-center" maxLength={2} value={txt}
      onFocus={(e) => { enfocado.current = true; e.target.select(); }}
      onBlur={() => { enfocado.current = false; setTxt(pad(value)); }}
      onChange={(e) => {
        const v = e.target.value.replace(/\D/g, '').slice(0, 2);
        setTxt(v);
        if (v !== '') onCommit(Math.min(max, Number(v)));
      }} />
  );
}
