import { Camera, FileText, Image as ImageIcon, Mic, Paperclip, Pencil, Plus, Reply, Send, Smile, BarChart3, X } from 'lucide-react';
import { ChangeEvent, ClipboardEvent, FormEvent, useRef, useState } from 'react';
import type { QuoteDTO } from '@/shared/api/types';
import { Spinner, proto } from '@/shared/ui/primitives';
import { EmojiPicker } from './EmojiPicker';

export interface StagedImage {
  key: string;
  name: string;
  preview: string;            // vista previa local (antes de enviar)
  status: 'uploading' | 'ready' | 'error';
  id?: string;                // id en el servidor cuando ya subió
  error?: string;
}

const quoteLabel = (q: QuoteDTO) => (q.kind === 'IMAGE' && q.text === 'Foto' ? '📷 Foto' : q.kind === 'DOCUMENT' && q.text === 'Documento' ? '📄 Documento' : q.text);

export function ChatComposer({
  text, setText, attached, removeAttached, onPickDocument, onSend, sending,
  images, onPickImages, removeImage, replyTo, onCancelReply, editing, onCancelEdit,
}: {
  text: string; setText: (t: string) => void;
  attached: Array<{ documentId: string; title: string }>; removeAttached: (id: string) => void;
  onPickDocument: () => void; onSend: () => void; sending: boolean;
  images: StagedImage[]; onPickImages: (files: File[]) => void; removeImage: (key: string) => void;
  replyTo: QuoteDTO | null; onCancelReply: () => void;
  /** Si hay un mensaje en edición, el cuadro cambia de modo: solo texto y «Guardar». */
  editing: { id: string } | null; onCancelEdit: () => void;
}) {
  const [emoji, setEmoji] = useState(false);
  const [menu, setMenu] = useState(false);
  const field = useRef<HTMLTextAreaElement>(null);
  const files = useRef<HTMLInputElement>(null);
  const uploading = images.some((i) => i.status === 'uploading');
  const readyImages = images.filter((i) => i.status === 'ready').length;
  const canSend = !uploading && (text.trim().length > 0 || (!editing && (attached.length > 0 || readyImages > 0)));

  const submit = (e: FormEvent) => { e.preventDefault(); if (canSend && !sending) onSend(); };

  /** Inserta el emoji donde está el cursor (no siempre al final). */
  const insertEmoji = (e: string) => {
    const el = field.current;
    const start = el?.selectionStart ?? text.length, end = el?.selectionEnd ?? text.length;
    setText(text.slice(0, start) + e + text.slice(end));
    requestAnimationFrame(() => { el?.focus(); const pos = start + e.length; el?.setSelectionRange(pos, pos); });
  };

  const onFiles = (e: ChangeEvent<HTMLInputElement>) => {
    const picked = Array.from(e.target.files ?? []);
    e.target.value = ''; // permite elegir la misma foto otra vez
    if (picked.length) onPickImages(picked);
  };
  const onPaste = (e: ClipboardEvent<HTMLTextAreaElement>) => {
    const pics = Array.from(e.clipboardData?.files ?? []).filter((f) => f.type.startsWith('image/'));
    if (pics.length && !editing) { e.preventDefault(); onPickImages(pics); }
  };

  return (
    <div className="relative border-t border-line bg-paper px-3 py-2.5">
      {editing && (
        <div className="mb-2 flex items-center gap-2 rounded-lg border-l-4 border-chat-accent bg-surface px-3 py-1.5 text-sm" role="status">
          <Pencil className="h-4 w-4 shrink-0 text-chat-accent" />
          <span className="flex-1 font-semibold text-chat-accent">Editando mensaje</span>
          <button type="button" className="rounded-full p-1 hover:bg-paper" aria-label="Cancelar edición" onClick={onCancelEdit}><X className="h-4 w-4" /></button>
        </div>
      )}

      {replyTo && !editing && (
        <div className="mb-2 flex items-start gap-2 rounded-lg border-l-4 border-chat-accent bg-surface px-3 py-1.5 text-sm" role="status" aria-label="Respondiendo a un mensaje">
          <Reply className="mt-0.5 h-4 w-4 shrink-0 text-chat-accent" />
          <span className="min-w-0 flex-1">
            <span className="block truncate font-semibold text-chat-accent">Respondiendo a {replyTo.authorName}</span>
            <span className="block truncate text-ink-soft">{quoteLabel(replyTo)}</span>
          </span>
          <button type="button" className="rounded-full p-1 hover:bg-paper" aria-label="Cancelar respuesta" onClick={onCancelReply}><X className="h-4 w-4" /></button>
        </div>
      )}

      {images.length > 0 && !editing && (
        <ul className="mb-2 flex flex-wrap gap-2" aria-label="Fotos por enviar">
          {images.map((im) => (
            <li key={im.key} className="relative h-16 w-16 overflow-hidden rounded-lg bg-surface shadow-card">
              {im.preview ? <img src={im.preview} alt={im.name} className={`h-full w-full object-cover ${im.status !== 'ready' ? 'opacity-50' : ''}`} /> : <ImageIcon className="m-auto mt-4 h-6 w-6 text-ink-mute" />}
              {im.status === 'uploading' && <span className="absolute inset-0 flex items-center justify-center" role="status" aria-label={`Subiendo ${im.name}`}><Spinner className="h-5 w-5 text-chat-accent" /></span>}
              {im.status === 'error' && <span className="absolute inset-x-0 bottom-0 bg-danger px-1 text-center text-[10px] font-semibold text-white" title={im.error}>Error</span>}
              <button type="button" aria-label={`Quitar ${im.name}`} className="absolute right-0.5 top-0.5 rounded-full bg-black/55 p-0.5 text-white hover:bg-black/75" onClick={() => removeImage(im.key)}><X className="h-3 w-3" /></button>
            </li>
          ))}
        </ul>
      )}
      {images.filter((i) => i.status === 'error').map((i) => (
        <p key={i.key} className="mb-1 text-xs text-danger" role="alert">{i.name}: {i.error}</p>
      ))}

      {attached.length > 0 && !editing && (
        <ul className="mb-2 flex flex-wrap gap-2">
          {attached.map((a) => (
            <li key={a.documentId} className="inline-flex items-center gap-2 rounded-full bg-surface py-1 pl-3 pr-1.5 text-xs font-semibold text-chat-dark shadow-card">
              <Paperclip className="h-3 w-3" />{a.title}
              <button type="button" aria-label={`Quitar ${a.title}`} className="rounded-full p-0.5 hover:bg-paper" onClick={() => removeAttached(a.documentId)}><X className="h-3.5 w-3.5" /></button>
            </li>
          ))}
        </ul>
      )}

      {emoji && <EmojiPicker onPick={insertEmoji} onClose={() => setEmoji(false)} />}
      {menu && !editing && (
        <ul className="animate-rise absolute bottom-full left-14 mb-2 w-52 overflow-hidden rounded-xl bg-surface py-2 shadow-pop" role="menu">
          <li><button role="menuitem" type="button" className="flex w-full items-center gap-3 px-4 py-2.5 text-sm font-medium hover:bg-paper" onClick={() => { setMenu(false); onPickDocument(); }}><FileText className="h-5 w-5 text-violet-500" /> Documento</button></li>
          <li><button role="menuitem" type="button" className="flex w-full items-center gap-3 px-4 py-2.5 text-sm font-medium hover:bg-paper" onClick={() => { setMenu(false); files.current?.click(); }}><ImageIcon className="h-5 w-5 text-sky-500" /> Fotos</button></li>
          <li><button role="menuitem" type="button" className="flex w-full items-center gap-3 px-4 py-2.5 text-sm font-medium hover:bg-paper" onClick={() => { setMenu(false); proto('La cámara'); }}><Camera className="h-5 w-5 text-rose-500" /> Cámara</button></li>
          <li><button role="menuitem" type="button" className="flex w-full items-center gap-3 px-4 py-2.5 text-sm font-medium hover:bg-paper" onClick={() => { setMenu(false); proto('Las encuestas'); }}><BarChart3 className="h-5 w-5 text-amber" /> Encuesta</button></li>
        </ul>
      )}
      <input ref={files} type="file" className="sr-only" tabIndex={-1} accept="image/png,image/jpeg,image/gif,image/webp" multiple aria-label="Elegir fotos" onChange={onFiles} />

      <form onSubmit={submit} className="flex items-end gap-2">
        <button type="button" data-emoji-toggle className="icon-btn !bg-transparent" aria-label="Emojis" aria-expanded={emoji} onClick={() => { setEmoji((v) => !v); setMenu(false); }}><Smile className="h-6 w-6 text-ink-soft" /></button>
        {!editing && <button type="button" className="icon-btn !bg-transparent" aria-label="Adjuntar" aria-expanded={menu} onClick={() => { setMenu((v) => !v); setEmoji(false); }}><Plus className={`h-6 w-6 text-ink-soft transition ${menu ? 'rotate-45' : ''}`} /></button>}
        <textarea ref={field} rows={1} placeholder={editing ? 'Edita tu mensaje' : 'Escribe un mensaje'} aria-label="Mensaje" value={text} onChange={(e) => setText(e.target.value)} onPaste={onPaste}
          className="max-h-28 flex-1 resize-none rounded-lg border-0 bg-surface px-4 py-2.5 text-[15px] placeholder:text-ink-mute focus:outline-none focus:ring-0"
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(e); }
            if (e.key === 'Escape') { if (editing) onCancelEdit(); else if (replyTo) onCancelReply(); }
          }} />
        {canSend || editing || uploading ? (
          <button className="icon-btn !bg-transparent" aria-label={editing ? 'Guardar cambios' : 'Enviar'} disabled={sending || !canSend}>
            {sending ? <Spinner className="h-5 w-5 text-chat-accent" /> : <Send className="h-6 w-6 text-chat-accent" />}
          </button>
        ) : (
          <button type="button" className="icon-btn !bg-transparent" aria-label="Grabar nota de voz" onClick={() => proto('Las notas de voz')}><Mic className="h-6 w-6 text-ink-soft" /></button>
        )}
      </form>
    </div>
  );
}
