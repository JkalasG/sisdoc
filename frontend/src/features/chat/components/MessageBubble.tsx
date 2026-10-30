import { Check, CheckCheck, Download, Pause, Play } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { AttachmentDTO, MessageDTO } from '@/shared/api/types';
import { clock, formatBytes } from '@/shared/format';
import { Art, FileTypeIcon } from '@/shared/ui/primitives';

export type Delivery = 'sent' | 'delivered' | 'read';

const NAME_COLORS = ['text-sky-700 dark:text-sky-300', 'text-rose-600 dark:text-rose-300', 'text-emerald-700 dark:text-emerald-300', 'text-violet-700 dark:text-violet-300', 'text-amber-700 dark:text-amber-300', 'text-fuchsia-700 dark:text-fuchsia-300'];
const hash = (s: string) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);

export function Ticks({ status }: { status: Delivery }) {
  if (status === 'sent') return <Check className="h-4 w-4 text-ink-mute" aria-label="Enviado" />;
  return <CheckCheck className={`h-4 w-4 ${status === 'read' ? 'text-chat-tick' : 'text-ink-mute'}`} aria-label={status === 'read' ? 'Leído' : 'Entregado'} />;
}

function Voice({ id, seconds }: { id: string; seconds: number }) {
  const [playing, setPlaying] = useState(false);
  const [pos, setPos] = useState(0);
  const bars = Array.from({ length: 28 }, (_, i) => 6 + ((hash(id) >> (i % 16)) % 5) * 4 + ((i * 7) % 6));

  useEffect(() => {
    if (!playing) return;
    const t = setInterval(() => setPos((p) => {
      if (p >= seconds) { setPlaying(false); return 0; }
      return p + 0.25;
    }), 250);
    return () => clearInterval(t);
  }, [playing, seconds]);

  const mm = (n: number) => `${Math.floor(n / 60)}:${String(Math.floor(n % 60)).padStart(2, '0')}`;
  return (
    <div className="flex w-60 items-center gap-2.5 py-1">
      <button onClick={() => setPlaying((p) => !p)} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-chat-accent text-white" aria-label={playing ? 'Pausar nota de voz' : 'Reproducir nota de voz'}>
        {playing ? <Pause className="h-4 w-4 fill-white" /> : <Play className="h-4 w-4 translate-x-px fill-white" />}
      </button>
      <div className="flex h-8 flex-1 items-center gap-[2px]" aria-hidden>
        {bars.map((h, i) => <span key={i} style={{ height: h }} className={`w-[3px] rounded-full ${(i / bars.length) * seconds <= pos && pos > 0 ? 'bg-chat-accent' : 'bg-ink-mute/50'}`} />)}
      </div>
      <span className="w-9 text-right text-xs text-ink-soft">{mm(playing || pos ? pos : seconds)}</span>
    </div>
  );
}

export function MessageBubble({ m, mine, group, status, onOpen }: {
  m: MessageDTO; mine: boolean; group: boolean; status: Delivery; onOpen: (a: AttachmentDTO) => void;
}) {
  const color = NAME_COLORS[hash(m.authorName) % NAME_COLORS.length];
  const mediaOnly = m.kind === 'image' && !m.content;
  return (
    <div className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
      <div className={`relative max-w-[82%] rounded-lg px-2.5 pb-1.5 pt-1.5 text-[14.5px] shadow-[0_1px_0.5px_rgba(0,0,0,.13)] sm:max-w-[65%] ${mine ? 'rounded-tr-none bg-chat-sent' : 'rounded-tl-none bg-surface'}`}>
        {group && !mine && <p className={`mb-0.5 text-[13px] font-semibold ${color}`}>{m.authorName}</p>}

        {m.replyTo && (
          <div className="mb-1.5 rounded-md border-l-4 border-chat-accent bg-ink/5 px-2.5 py-1.5 text-[13px]">
            <p className="font-semibold text-chat-accent">{m.replyTo.authorName}</p>
            <p className="line-clamp-2 text-ink-soft">{m.replyTo.text}</p>
          </div>
        )}

        {m.kind === 'image' && <div className="-mx-1 mb-1 overflow-hidden rounded-md"><Art seed={m.imageSeed ?? 1} className="max-h-72 min-w-56" /></div>}
        {m.kind === 'voice' && <Voice id={m.id} seconds={m.voiceSeconds ?? 10} />}

        {m.attachments.map((a) => (
          <button key={a.versionId} onClick={() => onOpen(a)} aria-label={`Descargar ${a.fileName}`}
            className="mb-1 flex w-64 max-w-full items-center gap-3 rounded-md bg-ink/5 p-2.5 text-left transition hover:bg-ink/10">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-surface text-brand"><FileTypeIcon mime={a.mimeType} /></span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold">{a.fileName}</span>
              <span className="text-xs text-ink-soft">v{a.versionNumber} · {formatBytes(a.sizeBytes)}</span>
            </span>
            <Download className="h-4 w-4 text-ink-soft" />
          </button>
        ))}

        <div className={`flex items-end gap-2 ${mediaOnly ? 'absolute bottom-2.5 right-3 rounded-full bg-black/45 px-1.5 py-0.5 text-white' : ''}`}>
          {m.content && <p className="min-w-0 flex-1 whitespace-pre-wrap break-words leading-snug">{m.content}</p>}
          <span className="ml-auto flex shrink-0 translate-y-0.5 items-center gap-1 pl-3 text-[11px] text-ink-mute">
            <time dateTime={m.createdAt}>{clock(m.createdAt)}</time>
            {mine && <Ticks status={status} />}
          </span>
        </div>
      </div>
    </div>
  );
}
