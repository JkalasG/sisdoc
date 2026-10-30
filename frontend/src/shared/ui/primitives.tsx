import { FileSpreadsheet, FileText, File as FileIcon, FileImage, Loader2, Users, X } from 'lucide-react';
import { ReactNode, useEffect, useId } from 'react';
import { create } from 'zustand';
import type { DocStatus } from '@/shared/api/types';
import { initials } from '@/shared/format';

// ---------------------------------------------------------------- estado de documento
const STATUS: Record<DocStatus, { label: string; cls: string }> = {
  BORRADOR: { label: 'Borrador', cls: 'bg-paper text-ink-soft' },
  REVISADO: { label: 'Revisado', cls: 'bg-brand-light text-brand' },
  EN_REVISION: { label: 'En revisión', cls: 'bg-amber-soft text-amber-ink' },
  APROBADO: { label: 'Aprobado', cls: 'bg-ok-soft text-ok-ink' },
  RECHAZADO: { label: 'Rechazado', cls: 'bg-danger-soft text-danger' },
  ARCHIVADO: { label: 'Archivado', cls: 'bg-paper text-ink-mute' },
};
export function StatusBadge({ status }: { status: DocStatus }) {
  const s = STATUS[status];
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold ${s.cls}`}>
      <span className="h-1.5 w-1.5 rounded-full bg-current" />{s.label}
    </span>
  );
}

export function FileTypeIcon({ mime, className = 'h-5 w-5' }: { mime: string; className?: string }) {
  if (mime.includes('spreadsheet')) return <FileSpreadsheet className={className} />;
  if (mime.startsWith('image/')) return <FileImage className={className} />;
  if (mime.includes('pdf') || mime.includes('word') || mime.startsWith('text/')) return <FileText className={className} />;
  return <FileIcon className={className} />;
}

// ---------------------------------------------------------------- avatar
const GRADIENTS = [
  'from-sky-400 to-blue-600', 'from-rose-400 to-pink-600', 'from-amber-400 to-orange-600', 'from-emerald-400 to-teal-600',
  'from-violet-400 to-purple-600', 'from-fuchsia-400 to-pink-600', 'from-cyan-400 to-sky-600', 'from-lime-500 to-green-600',
];
const hash = (s: string) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);
const SIZES = {
  xs: 'h-6 w-6 text-[9px]', sm: 'h-8 w-8 text-[11px]', md: 'h-10 w-10 text-sm', lg: 'h-14 w-14 text-lg',
  xl: 'h-28 w-28 text-4xl sm:h-36 sm:w-36',
} as const;

export function Avatar({
  name, size = 'md', ring = false, seen = false, online, group = false,
}: { name: string; size?: keyof typeof SIZES; ring?: boolean; seen?: boolean; online?: boolean; group?: boolean }) {
  const body = (
    <span
      className={`relative inline-flex shrink-0 items-center justify-center rounded-full bg-gradient-to-br font-bold text-white ${SIZES[size]} ${GRADIENTS[hash(name) % GRADIENTS.length]}`}
      aria-hidden
    >
      {group ? <Users className="h-1/2 w-1/2" /> : initials(name)}
      {online !== undefined && (
        <span className={`absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-surface ${online ? 'bg-ok-soft0' : 'hidden'}`} />
      )}
    </span>
  );
  if (!ring) return body;
  return (
    <span className={`inline-flex rounded-full p-[2.5px] ${seen ? 'bg-line' : 'bg-gradient-to-tr from-yellow-400 via-rose-500 to-fuchsia-600'}`}>
      <span className="rounded-full bg-surface p-[2px]">{body}</span>
    </span>
  );
}

// ---------------------------------------------------------------- imagen de relleno (sin archivos externos)
const PALETTES = [
  ['#6EE7F9', '#3B82F6', '#1E3A8A'], ['#FDBA74', '#F43F5E', '#7C3AED'], ['#86EFAC', '#10B981', '#0F766E'],
  ['#FDE68A', '#F59E0B', '#B45309'], ['#C4B5FD', '#8B5CF6', '#4C1D95'], ['#FBCFE8', '#EC4899', '#831843'],
  ['#A5F3FC', '#06B6D4', '#155E75'], ['#BEF264', '#65A30D', '#365314'],
];
/** Ilustración abstracta determinista. Hace de «foto» en los prototipos. */
export function Art({ seed, className = '' }: { seed: number; className?: string }) {
  const id = useId();
  const p = PALETTES[Math.abs(seed) % PALETTES.length];
  const a = (seed * 53) % 260, b = (seed * 97) % 180;
  return (
    <svg viewBox="0 0 400 300" preserveAspectRatio="xMidYMid slice" className={`block w-full ${className}`} aria-hidden>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={p[0]} /><stop offset=".55" stopColor={p[1]} /><stop offset="1" stopColor={p[2]} />
        </linearGradient>
      </defs>
      <rect width="400" height="300" fill={`url(#${id})`} />
      <circle cx={70 + a} cy={60 + b / 2} r="70" fill="#fff" opacity=".22" />
      <circle cx={330 - a / 2} cy={230 - b / 2} r="95" fill="#fff" opacity=".12" />
      <path d={`M0 ${210 + (seed % 3) * 14} C 90 ${160 + b / 3}, 200 ${270 - b / 4}, 400 ${190 + (seed % 4) * 10} V300 H0Z`} fill="#000" opacity=".2" />
    </svg>
  );
}

// ---------------------------------------------------------------- aviso flotante («prototipo»)
interface ToastState { message: string | null; show: (m: string) => void }
let toastTimer: ReturnType<typeof setTimeout> | undefined;
export const useToast = create<ToastState>((set) => ({
  message: null,
  show: (message) => {
    clearTimeout(toastTimer);
    set({ message });
    toastTimer = setTimeout(() => set({ message: null }), 2600);
  },
}));
/** Para botones del prototipo que aún no tienen función. */
export const proto = (what = 'Esta función') => useToast.getState().show(`${what} está en prototipo: todavía no está conectada.`);

export function Toaster() {
  const message = useToast((s) => s.message);
  if (!message) return null;
  return (
    <div role="status" className="animate-toast fixed bottom-24 left-1/2 z-[80] max-w-[90vw] -translate-x-1/2 rounded-lg bg-ink px-4 py-2.5 text-sm text-surface shadow-pop md:bottom-8">
      {message}
    </div>
  );
}

// ---------------------------------------------------------------- utilidades
export const Spinner = ({ className = 'h-5 w-5' }: { className?: string }) => (
  <Loader2 className={`animate-spin ${className}`} aria-label="Cargando" />
);

export function EmptyState({ icon, title, hint, action }: { icon: ReactNode; title: string; hint?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3 px-6 py-14 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-paper text-ink-soft">{icon}</div>
      <p className="text-lg font-bold">{title}</p>
      {hint && <p className="max-w-sm text-sm text-ink-soft">{hint}</p>}
      {action}
    </div>
  );
}

export function ErrorNote({ message }: { message?: string | null }) {
  if (!message) return null;
  return <p role="alert" className="rounded-lg bg-danger-soft px-3.5 py-2.5 text-sm text-danger">{message}</p>;
}

export { Modal } from './Modal';
