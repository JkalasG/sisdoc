import { Camera, Check, CheckCheck, Download, FileText, Info, Pause, Pencil, Play, Reply } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { AttachmentDTO, ImageDTO, MessageDTO } from '@/shared/api/types';
import { clock, formatBytes, fullStamp } from '@/shared/format';
import { Art, FileTypeIcon } from '@/shared/ui/primitives';
import { imageUrl } from '../api/chat.api';
import type { Delivery } from '../lib/delivery';

export type { Delivery };

const NAME_COLORS = ['text-sky-700 dark:text-sky-300', 'text-rose-600 dark:text-rose-300', 'text-emerald-700 dark:text-emerald-300', 'text-violet-700 dark:text-violet-300', 'text-amber-700 dark:text-amber-300', 'text-fuchsia-700 dark:text-fuchsia-300'];
const hash = (s: string) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);

const TICK_LABEL: Record<Delivery, string> = { sent: 'Enviado', delivered: 'Entregado', read: 'Leído' };

export function Ticks({ status }: { status: Delivery }) {
  if (status === 'sent') return <Check className="h-4 w-4 text-ink-mute" aria-label={TICK_LABEL.sent} />;
  return <CheckCheck className={`h-4 w-4 ${status === 'read' ? 'text-chat-tick' : 'text-ink-mute'}`} aria-label={TICK_LABEL[status]} />;
}

/** Fotos del mensaje: 1 grande; 2 en columnas; 3 o más en cuadrícula, con «+N» si hay más de 4. */
function Photos({ conversationId, images, onOpen }: { conversationId: string; images: ImageDTO[]; onOpen: (index: number) => void }) {
  const shown = images.slice(0, 4);
  const extra = images.length - shown.length;
  const single = images.length === 1;
  return (
    <div className={`-mx-1 mb-1 grid gap-0.5 overflow-hidden rounded-md ${single ? 'grid-cols-1' : 'grid-cols-2'}`}>
      {shown.map((im, i) => (
        <button key={im.id} type="button" onClick={() => onOpen(i)} aria-label={`Ver foto ${i + 1} de ${images.length}: ${im.fileName}`}
          className="relative block overflow-hidden bg-ink/10" style={single ? { aspectRatio: `${im.width} / ${im.height}`, maxHeight: 340 } : { aspectRatio: '1 / 1' }}>
          <img src={imageUrl(conversationId, im)} alt={im.fileName} width={im.width} height={im.height} loading="lazy" decoding="async"
            className={`h-full w-full ${single ? 'object-contain' : 'object-cover'}`} />
          {extra > 0 && i === shown.length - 1 && <span className="absolute inset-0 flex items-center justify-center bg-black/55 text-2xl font-semibold text-white">+{extra}</span>}
        </button>
      ))}
    </div>
  );
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

export function MessageBubble({ m, mine, group, status, onOpen, conversationId, canEdit, highlight, onReply, onEdit, onInfo, onJump, onOpenImage }: {
  m: MessageDTO; mine: boolean; group: boolean; status: Delivery; onOpen: (a: AttachmentDTO) => void;
  conversationId: string; canEdit: boolean; highlight: boolean;
  onReply: (m: MessageDTO) => void; onEdit: (m: MessageDTO) => void; onInfo: (m: MessageDTO) => void;
  onJump: (id: string) => void; onOpenImage: (images: ImageDTO[], index: number) => void;
}) {
  const color = NAME_COLORS[hash(m.authorName) % NAME_COLORS.length];
  const images = m.images ?? [];
  const mediaOnly = (m.kind === 'image' || images.length > 0) && !m.content;
  const act = 'rounded-full p-1.5 text-ink-soft hover:bg-paper hover:text-ink';
  return (
    <div className={`group flex ${mine ? 'justify-end' : 'justify-start'}`}>
      <div className={`relative max-w-[82%] rounded-lg px-2.5 pb-1.5 pt-1.5 text-[14.5px] shadow-[0_1px_0.5px_rgba(0,0,0,.13)] transition-shadow sm:max-w-[65%] ${mine ? 'rounded-tr-none bg-chat-sent' : 'rounded-tl-none bg-surface'} ${highlight ? 'ring-2 ring-chat-accent ring-offset-2 ring-offset-transparent' : ''}`}>
        {/* Acciones: aparecen al pasar el cursor o enfocar; en pantallas táctiles quedan visibles. */}
        <div className={`absolute -top-3 z-10 flex rounded-full bg-surface px-0.5 py-0.5 opacity-0 shadow-card transition focus-within:opacity-100 group-hover:opacity-100 [@media(hover:none)]:opacity-100 ${mine ? 'right-1' : 'left-1'}`} role="toolbar" aria-label="Acciones del mensaje">
          <button type="button" className={act} aria-label="Responder" title="Responder" onClick={() => onReply(m)}><Reply className="h-3.5 w-3.5" /></button>
          {canEdit && <button type="button" className={act} aria-label="Editar mensaje" title="Editar (solo tus últimos 3 mensajes)" onClick={() => onEdit(m)}><Pencil className="h-3.5 w-3.5" /></button>}
          {mine && <button type="button" className={act} aria-label="Información del mensaje" title="Enviado, entregado y leído" onClick={() => onInfo(m)}><Info className="h-3.5 w-3.5" /></button>}
        </div>

        {group && !mine && <p className={`mb-0.5 text-[13px] font-semibold ${color}`}>{m.authorName}</p>}

        {m.replyTo && (
          <button type="button" onClick={() => onJump(m.replyTo!.id)} aria-label={`Ir al mensaje original de ${m.replyTo.authorName}`}
            className="mb-1.5 block w-full rounded-md border-l-4 border-chat-accent bg-ink/5 px-2.5 py-1.5 text-left text-[13px] transition hover:bg-ink/10">
            <span className="block font-semibold text-chat-accent">{m.replyTo.authorName}</span>
            <span className="flex items-center gap-1 text-ink-soft">
              {m.replyTo.kind === 'IMAGE' && <Camera className="h-3.5 w-3.5 shrink-0" />}
              {m.replyTo.kind === 'DOCUMENT' && <FileText className="h-3.5 w-3.5 shrink-0" />}
              <span className="line-clamp-2">{m.replyTo.text}</span>
            </span>
          </button>
        )}

        {images.length > 0 && <Photos conversationId={conversationId} images={images} onOpen={(i) => onOpenImage(images, i)} />}
        {m.kind === 'image' && images.length === 0 && <div className="-mx-1 mb-1 overflow-hidden rounded-md"><Art seed={m.imageSeed ?? 1} className="max-h-72 min-w-56" /></div>}
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
            {m.editedAt && <span title={`Editado el ${fullStamp(m.editedAt)}`}>editado</span>}
            <time dateTime={m.createdAt} title={fullStamp(m.createdAt)}>{clock(m.createdAt)}</time>
            {mine && <Ticks status={status} />}
          </span>
        </div>
      </div>
    </div>
  );
}
