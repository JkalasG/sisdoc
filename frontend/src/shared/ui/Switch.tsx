import { useId } from 'react';

/**
 * Interruptor accesible (role="switch"). `labelOff` / `labelOn` nombran cada posición
 * (p. ej. «Borrador» / «Revisado»); la activa se resalta.
 */
export function Switch({ checked, onChange, label, labelOff, labelOn, hint }: {
  checked: boolean; onChange: (v: boolean) => void; label: string; labelOff?: string; labelOn?: string; hint?: string;
}) {
  const id = useId();
  return (
    <div className="flex items-center gap-3 rounded-lg border border-line bg-surface px-3.5 py-2">
      <button id={id} type="button" role="switch" aria-checked={checked} aria-label={label} onClick={() => onChange(!checked)}
        className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${checked ? 'bg-brand' : 'bg-ink-mute/50'}`}>
        <span className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow-card transition-transform ${checked ? 'translate-x-5' : ''}`} />
      </button>
      <label htmlFor={id} className="min-w-0 cursor-pointer text-[15px]">
        <span className="block font-semibold">{label}</span>
        {(labelOff || labelOn) && (
          <span className="flex gap-1.5 text-xs">
            <span className={checked ? 'text-ink-mute' : 'font-semibold text-ink'}>{labelOff}</span>
            <span className="text-ink-mute">/</span>
            <span className={checked ? 'font-semibold text-brand' : 'text-ink-mute'}>{labelOn}</span>
          </span>
        )}
        {hint && <span className="block text-xs text-ink-soft">{hint}</span>}
      </label>
    </div>
  );
}
