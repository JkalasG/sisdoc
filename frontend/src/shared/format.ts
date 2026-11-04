export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MB`;
  return `${(n / 1024 ** 3).toFixed(1)} GB`;
}

const rtf = new Intl.RelativeTimeFormat('es', { numeric: 'auto' });
export function timeAgo(iso: string): string {
  const diff = (new Date(iso).getTime() - Date.now()) / 1000;
  const abs = Math.abs(diff);
  if (abs < 60) return 'hace un momento';
  if (abs < 3600) return rtf.format(Math.round(diff / 60), 'minute');
  if (abs < 86400) return rtf.format(Math.round(diff / 3600), 'hour');
  if (abs < 86400 * 30) return rtf.format(Math.round(diff / 86400), 'day');
  return new Date(iso).toLocaleDateString('es');
}

export const fullDate = (iso: string) =>
  new Date(iso).toLocaleString('es', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

export const initials = (name: string) =>
  name.split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase() ?? '').join('');

export const shortHash = (h: string) => `${h.slice(0, 8)}…${h.slice(-6)}`;

/** Hora corta tipo mensajería: «10:32» si es hoy, «ayer», día de la semana o fecha. */
export function shortTime(iso: string): string {
  const d = new Date(iso), now = new Date();
  const days = Math.floor((new Date(now.toDateString()).getTime() - new Date(d.toDateString()).getTime()) / 86_400_000);
  if (days <= 0) return d.toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit', hour12: false });
  if (days === 1) return 'ayer';
  if (days < 7) return d.toLocaleDateString('es', { weekday: 'long' });
  return d.toLocaleDateString('es', { day: '2-digit', month: '2-digit', year: '2-digit' });
}
export const clock = (iso: string) => new Date(iso).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit', hour12: false });
export function dayLabel(iso: string): string {
  const d = new Date(iso), now = new Date();
  const days = Math.floor((new Date(now.toDateString()).getTime() - new Date(d.toDateString()).getTime()) / 86_400_000);
  if (days <= 0) return 'Hoy';
  if (days === 1) return 'Ayer';
  return d.toLocaleDateString('es', { weekday: 'long', day: 'numeric', month: 'long' });
}

/** Fecha y hora CON segundos, para auditoría: «15/03/2024 14:35:07». */
export const fullStamp = (iso: string) => {
  const d = new Date(iso), p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
};

/** Fecha y hora para tablas: «15/03/2024 14:35». */
export const shortDate = (iso: string) => {
  const d = new Date(iso), p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
};
/** Nombre sugerido de un documento: el del archivo sin extensión (igual que el backend). */
export const nombreDesdeArchivo = (fileName: string) =>
  fileName.replace(/\.[^./\\]+$/, '').replace(/_+/g, ' ').trim() || fileName;
