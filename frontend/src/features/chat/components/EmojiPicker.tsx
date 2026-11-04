import { Search } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { EMOJI_CATEGORIES, searchEmojis } from './emoji-data';

const RECENT_KEY = 'iris.emojis.recientes';
const RECENT_MAX = 24;

function readRecent(): string[] {
  try {
    const raw = JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]');
    return Array.isArray(raw) ? raw.filter((x): x is string => typeof x === 'string').slice(0, RECENT_MAX) : [];
  } catch { return []; }
}
function rememberEmoji(emoji: string) {
  try {
    const next = [emoji, ...readRecent().filter((e) => e !== emoji)].slice(0, RECENT_MAX);
    localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch { /* sin almacenamiento: simplemente no se recuerdan */ }
}

/** Selector de emojis con categorías, búsqueda en español y «recientes». Se cierra con Esc o al hacer clic fuera. */
export function EmojiPicker({ onPick, onClose }: { onPick: (emoji: string) => void; onClose: () => void }) {
  const [category, setCategory] = useState<string>(() => (readRecent().length ? 'recientes' : 'caras'));
  const [q, setQ] = useState('');
  const [recent, setRecent] = useState<string[]>(readRecent);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    const onDown = (e: MouseEvent) => {
      const el = box.current;
      // El botón que abre el selector tiene su propio manejo; aquí solo se ignora lo que cae dentro del selector.
      if (el && !el.contains(e.target as Node) && !(e.target as Element).closest?.('[data-emoji-toggle]')) onClose();
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onDown);
    return () => { document.removeEventListener('keydown', onKey); document.removeEventListener('mousedown', onDown); };
  }, [onClose]);

  const found = useMemo(() => (q.trim() ? searchEmojis(q) : null), [q]);
  const shown: Array<readonly [string, string]> = found
    ? found
    : category === 'recientes'
      ? recent.map((e) => [e, e] as const)
      : (EMOJI_CATEGORIES.find((c) => c.id === category)?.emojis ?? []);

  const pick = (emoji: string) => { rememberEmoji(emoji); setRecent(readRecent()); onPick(emoji); };

  return (
    <div ref={box} className="animate-rise absolute bottom-full left-3 z-30 mb-2 w-[22rem] max-w-[calc(100vw-1.5rem)] overflow-hidden rounded-xl bg-surface shadow-pop" role="group" aria-label="Emojis">
      <div className="relative border-b border-line p-2">
        <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-mute" />
        <input className="w-full rounded-full bg-paper py-1.5 pl-9 pr-3 text-sm placeholder:text-ink-mute focus:outline-none focus:ring-2 focus:ring-chat-accent/30"
          placeholder="Buscar emoji (ej. fuego, gracias)" aria-label="Buscar emoji" value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
      </div>

      {!found && (
        <div className="flex gap-0.5 overflow-x-auto border-b border-line px-1.5 py-1" role="tablist" aria-label="Categorías de emojis">
          {[{ id: 'recientes', label: 'Recientes', icon: '🕘' }, ...EMOJI_CATEGORIES].map((c) => (
            <button key={c.id} type="button" role="tab" aria-selected={category === c.id} aria-label={c.label} title={c.label}
              onClick={() => setCategory(c.id)}
              className={`shrink-0 rounded-md px-2 py-1 text-lg transition ${category === c.id ? 'bg-ok-soft' : 'hover:bg-paper'}`}>{c.icon}</button>
          ))}
        </div>
      )}

      <div className="grid max-h-60 grid-cols-8 gap-0.5 overflow-y-auto p-2">
        {shown.map(([e, name]) => (
          <button key={e} type="button" className="rounded-md p-1 text-2xl leading-none hover:bg-paper" aria-label={name.split(' ')[0] === e ? e : name.split(' ').slice(0, 3).join(' ')} title={name === e ? undefined : name}
            onClick={() => pick(e)}>{e}</button>
        ))}
        {shown.length === 0 && (
          <p className="col-span-8 p-4 text-center text-sm text-ink-mute">
            {found ? 'Ningún emoji coincide.' : 'Aquí aparecerán los emojis que uses.'}
          </p>
        )}
      </div>
    </div>
  );
}
