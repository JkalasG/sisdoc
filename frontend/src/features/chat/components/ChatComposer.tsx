import { Camera, FileText, Image as ImageIcon, Mic, Paperclip, Plus, Send, Smile, BarChart3, X } from 'lucide-react';
import { FormEvent, useState } from 'react';
import { Spinner, proto } from '@/shared/ui/primitives';

const EMOJIS = ['😀', '😂', '🙂', '😍', '🥰', '😎', '🤔', '😅', '🙏', '👍', '👏', '🙌', '🎉', '🔥', '💙', '✅', '📎', '📄', '⏰', '👀', '💪', '🤝', '😢', '😮'];

export function ChatComposer({ text, setText, attached, removeAttached, onPickDocument, onSend, sending }: {
  text: string; setText: (t: string) => void;
  attached: Array<{ documentId: string; title: string }>; removeAttached: (id: string) => void;
  onPickDocument: () => void; onSend: () => void; sending: boolean;
}) {
  const [emoji, setEmoji] = useState(false);
  const [menu, setMenu] = useState(false);
  const canSend = text.trim().length > 0 || attached.length > 0;

  const submit = (e: FormEvent) => { e.preventDefault(); if (canSend && !sending) onSend(); };

  return (
    <div className="relative border-t border-line bg-paper px-3 py-2.5">
      {attached.length > 0 && (
        <ul className="mb-2 flex flex-wrap gap-2">
          {attached.map((a) => (
            <li key={a.documentId} className="inline-flex items-center gap-2 rounded-full bg-surface py-1 pl-3 pr-1.5 text-xs font-semibold text-chat-dark shadow-card">
              <Paperclip className="h-3 w-3" />{a.title}
              <button type="button" aria-label={`Quitar ${a.title}`} className="rounded-full p-0.5 hover:bg-paper" onClick={() => removeAttached(a.documentId)}><X className="h-3.5 w-3.5" /></button>
            </li>
          ))}
        </ul>
      )}

      {emoji && (
        <div className="animate-rise absolute bottom-full left-3 mb-2 grid w-72 grid-cols-8 gap-1 rounded-xl bg-surface p-2.5 shadow-pop" role="group" aria-label="Emojis">
          {EMOJIS.map((e) => <button key={e} type="button" className="rounded-md p-1 text-xl hover:bg-paper" onClick={() => setText(text + e)}>{e}</button>)}
        </div>
      )}
      {menu && (
        <ul className="animate-rise absolute bottom-full left-14 mb-2 w-52 overflow-hidden rounded-xl bg-surface py-2 shadow-pop" role="menu">
          <li><button role="menuitem" type="button" className="flex w-full items-center gap-3 px-4 py-2.5 text-sm font-medium hover:bg-paper" onClick={() => { setMenu(false); onPickDocument(); }}><FileText className="h-5 w-5 text-violet-500" /> Documento</button></li>
          <li><button role="menuitem" type="button" className="flex w-full items-center gap-3 px-4 py-2.5 text-sm font-medium hover:bg-paper" onClick={() => { setMenu(false); proto('Enviar fotos'); }}><ImageIcon className="h-5 w-5 text-sky-500" /> Fotos y videos</button></li>
          <li><button role="menuitem" type="button" className="flex w-full items-center gap-3 px-4 py-2.5 text-sm font-medium hover:bg-paper" onClick={() => { setMenu(false); proto('La cámara'); }}><Camera className="h-5 w-5 text-rose-500" /> Cámara</button></li>
          <li><button role="menuitem" type="button" className="flex w-full items-center gap-3 px-4 py-2.5 text-sm font-medium hover:bg-paper" onClick={() => { setMenu(false); proto('Las encuestas'); }}><BarChart3 className="h-5 w-5 text-amber" /> Encuesta</button></li>
        </ul>
      )}

      <form onSubmit={submit} className="flex items-end gap-2">
        <button type="button" className="icon-btn !bg-transparent" aria-label="Emojis" aria-expanded={emoji} onClick={() => { setEmoji((v) => !v); setMenu(false); }}><Smile className="h-6 w-6 text-ink-soft" /></button>
        <button type="button" className="icon-btn !bg-transparent" aria-label="Adjuntar" aria-expanded={menu} onClick={() => { setMenu((v) => !v); setEmoji(false); }}><Plus className={`h-6 w-6 text-ink-soft transition ${menu ? 'rotate-45' : ''}`} /></button>
        <textarea rows={1} placeholder="Escribe un mensaje" aria-label="Mensaje" value={text} onChange={(e) => setText(e.target.value)}
          className="max-h-28 flex-1 resize-none rounded-lg border-0 bg-surface px-4 py-2.5 text-[15px] placeholder:text-ink-mute focus:outline-none focus:ring-0"
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(e); } }} />
        {canSend ? (
          <button className="icon-btn !bg-transparent" aria-label="Enviar" disabled={sending}>
            {sending ? <Spinner className="h-5 w-5 text-chat-accent" /> : <Send className="h-6 w-6 text-chat-accent" />}
          </button>
        ) : (
          <button type="button" className="icon-btn !bg-transparent" aria-label="Grabar nota de voz" onClick={() => proto('Las notas de voz')}><Mic className="h-6 w-6 text-ink-soft" /></button>
        )}
      </form>
    </div>
  );
}
