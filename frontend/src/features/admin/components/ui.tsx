import { ReactNode } from 'react';
import { timeAgo } from '@/shared/format';

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <header className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl">{title}</h1>
        {subtitle && <p className="mt-0.5 text-sm text-ink-soft">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </header>
  );
}

const TONES = {
  ok: 'bg-ok-soft text-ok-ink ring-ok/25',
  warn: 'bg-amber-soft text-amber-ink ring-amber/30',
  bad: 'bg-danger-soft text-danger ring-danger/20',
  info: 'bg-brand-light text-brand ring-brand/20',
  mute: 'bg-paper text-ink-soft ring-ink-mute/30',
} as const;
export type Tone = keyof typeof TONES;

export const Pill = ({ tone = 'mute', children }: { tone?: Tone; children: ReactNode }) => (
  <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset ${TONES[tone]}`}>
    <span className="h-1.5 w-1.5 rounded-full bg-current" />{children}
  </span>
);

export function StatCard({ label, value, hint, icon, tone = 'info' }: { label: string; value: ReactNode; hint?: string; icon: ReactNode; tone?: Tone }) {
  return (
    <div className="card p-4">
      <div className="flex items-start justify-between">
        <p className="text-sm font-medium text-ink-soft">{label}</p>
        <span className={`flex h-9 w-9 items-center justify-center rounded-lg ${TONES[tone].split(' ').slice(0, 2).join(' ')}`}>{icon}</span>
      </div>
      <p className="mt-2 text-3xl font-bold tracking-tight">{value}</p>
      {hint && <p className="mt-1 text-xs text-ink-soft">{hint}</p>}
    </div>
  );
}

export function Panel({ title, actions, children, flush }: { title?: string; actions?: ReactNode; children: ReactNode; flush?: boolean }) {
  return (
    <section className="card">
      {(title || actions) && (
        <header className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3">
          {title && <h2 className="text-base font-semibold">{title}</h2>}
          {actions}
        </header>
      )}
      <div className={flush ? '' : 'p-4'}>{children}</div>
    </section>
  );
}

export interface Column<T> { header: string; cell: (row: T) => ReactNode; className?: string }

export function DataTable<T extends { id: string }>({ columns, rows, empty = 'Sin registros', label }: {
  columns: Column<T>[]; rows: T[]; empty?: string; label: string;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] text-left text-sm" aria-label={label}>
        <thead>
          <tr className="border-b border-line bg-paper text-xs uppercase tracking-wide text-ink-soft">
            {columns.map((c) => <th key={c.header} scope="col" className={`px-4 py-2.5 font-semibold ${c.className ?? ''}`}>{c.header}</th>)}
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {rows.map((r) => (
            <tr key={r.id} className="transition hover:bg-paper/70">
              {columns.map((c) => <td key={c.header} className={`px-4 py-3 align-middle ${c.className ?? ''}`}>{c.cell(r)}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length === 0 && <p className="px-4 py-10 text-center text-sm text-ink-soft">{empty}</p>}
      <p className="border-t border-line px-4 py-2 text-xs text-ink-soft">{rows.length} registro{rows.length === 1 ? '' : 's'}</p>
    </div>
  );
}

export function Tabs<T extends string>({ value, onChange, items }: { value: T; onChange: (v: T) => void; items: Array<{ id: T; label: string; count?: number }> }) {
  return (
    <div className="flex gap-1 border-b border-line" role="tablist">
      {items.map((i) => (
        <button key={i.id} role="tab" aria-selected={value === i.id} onClick={() => onChange(i.id)}
          className={`-mb-px flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-semibold transition ${value === i.id ? 'border-brand text-brand' : 'border-transparent text-ink-soft hover:text-ink'}`}>
          {i.label}
          {i.count !== undefined && <span className={`rounded-full px-2 py-0.5 text-[11px] ${value === i.id ? 'bg-brand-light' : 'bg-paper'}`}>{i.count}</span>}
        </button>
      ))}
    </div>
  );
}

export function SearchBox({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return <input className="field !w-64 !py-2 text-sm" placeholder={placeholder} aria-label={placeholder} value={value} onChange={(e) => onChange(e.target.value)} />;
}

export const When = ({ iso }: { iso?: string }) =>
  iso ? <time dateTime={iso} title={new Date(iso).toLocaleString('es')} className="whitespace-nowrap text-ink-soft">{timeAgo(iso)}</time> : <span className="text-ink-mute">—</span>;

export const Btn = ({ children, onClick, tone = 'ghost', disabled, label }: { children: ReactNode; onClick: () => void; tone?: 'primary' | 'ghost' | 'danger' | 'success'; disabled?: boolean; label?: string }) => (
  <button onClick={onClick} disabled={disabled} aria-label={label} title={label}
    className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition disabled:opacity-40 ${
      tone === 'primary' ? 'bg-brand text-white hover:bg-brand-dark' : tone === 'danger' ? 'bg-danger-soft text-danger hover:bg-danger/15'
      : tone === 'success' ? 'bg-ok-soft text-ok-ink hover:bg-ok/20' : 'border border-line bg-surface text-ink hover:bg-paper'}`}>
    {children}
  </button>
);

/** Gráfico de barras agrupadas en SVG puro (sin librerías). */
export function BarChart({ data }: { data: Array<{ day: string; ok: number; fail: number }> }) {
  const max = Math.max(...data.map((d) => d.ok + d.fail), 1);
  const H = 160;
  return (
    <figure>
      <svg viewBox={`0 0 ${data.length * 56} ${H + 28}`} className="w-full" role="img" aria-label="Inicios de sesión de los últimos 7 días">
        {[0.25, 0.5, 0.75, 1].map((g) => <line key={g} x1="0" x2={data.length * 56} y1={H - g * H} y2={H - g * H} className="stroke-line" strokeDasharray="3 3" />)}
        {data.map((d, i) => {
          const okH = (d.ok / max) * H, failH = (d.fail / max) * H;
          return (
            <g key={d.day} transform={`translate(${i * 56 + 12}, 0)`}>
              <rect y={H - okH} width="32" height={okH} rx="4" className="fill-brand"><title>{`${d.day}: ${d.ok} correctos`}</title></rect>
              <rect y={H - okH - failH} width="32" height={failH} rx="4" className="fill-danger"><title>{`${d.day}: ${d.fail} fallidos`}</title></rect>
              <text x="16" y={H + 18} textAnchor="middle" className="fill-ink-soft text-[11px]">{d.day}</text>
            </g>
          );
        })}
      </svg>
      <figcaption className="mt-1 flex gap-4 text-xs text-ink-soft">
        <span className="flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-sm bg-brand" />Correctos</span>
        <span className="flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-sm bg-danger" />Fallidos</span>
      </figcaption>
    </figure>
  );
}
