import { Monitor, Moon, Sun } from 'lucide-react';
import { useThemePref, type ThemePref } from '@/shared/theme';

const OPTIONS: Array<{ id: ThemePref; label: string; icon: typeof Sun }> = [
  { id: 'light', label: 'Claro', icon: Sun },
  { id: 'dark', label: 'Oscuro', icon: Moon },
  { id: 'system', label: 'Auto', icon: Monitor },
];

/** Selector de apariencia (claro / oscuro / automático). Se usa en el menú de cuenta y en el panel admin. */
export function ThemeSwitch() {
  const [pref, set] = useThemePref();
  return (
    <div role="radiogroup" aria-label="Apariencia" className="flex gap-1 rounded-lg bg-paper p-1">
      {OPTIONS.map(({ id, label, icon: Icon }) => (
        <button key={id} type="button" role="radio" aria-checked={pref === id} onClick={() => set(id)}
          className={`flex flex-1 items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-semibold transition ${pref === id ? 'bg-surface text-brand shadow-card' : 'text-ink-soft hover:text-ink'}`}>
          <Icon className="h-3.5 w-3.5" />{label}
        </button>
      ))}
    </div>
  );
}
