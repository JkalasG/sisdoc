import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Info, MessageCircle, Phone, Search, Video } from 'lucide-react';
import { Fragment, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { filesApi } from '@/features/files/api/files.api';
import { useSession } from '@/features/auth/store/session';
import { ApiError } from '@/shared/api/http';
import type { AttachmentDTO, ConversationDTO, MessageDTO } from '@/shared/api/types';
import { dayLabel, formatBytes, shortTime } from '@/shared/format';
import { Avatar, ErrorNote, FileTypeIcon, Modal, Spinner, proto } from '@/shared/ui/primitives';
import { chatApi, subscribeToChat } from '../api/chat.api';
import { ChatComposer } from '../components/ChatComposer';
import { ChatList } from '../components/ChatList';
import { InfoPanel } from '../components/InfoPanel';
import { Delivery, MessageBubble } from '../components/MessageBubble';

export function ChatPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const me = useSession((s) => s.user)!;
  const [typing, setTyping] = useState<Record<string, string>>({});
  const { data: conversations, isLoading, error } = useQuery({ queryKey: ['conversations'], queryFn: chatApi.conversations });

  // Tiempo real: mensajes entrantes y «escribiendo…» sin recargar.
  useEffect(() => subscribeToChat({
    onMessage: (m) => {
      qc.setQueryData<MessageDTO[]>(['messages', m.conversationId], (old) => (old?.some((x) => x.id === m.id) ? old : [...(old ?? []), m]));
      qc.invalidateQueries({ queryKey: ['conversations'] });
    },
    onTyping: (t) => setTyping((cur) => {
      const next = { ...cur };
      if (t.on) next[t.conversationId] = t.name; else delete next[t.conversationId];
      return next;
    }),
  }), [qc]);

  const active = conversations?.find((c) => c.id === id) ?? null;

  return (
    <div className={`mx-auto flex w-full max-w-[1500px] md:p-4 ${id ? 'h-[calc(100dvh-56px)]' : 'h-[calc(100dvh-112px)]'} md:h-[calc(100dvh-56px)]`}>
      <div className="flex h-full w-full overflow-hidden bg-surface shadow-card md:rounded-xl">
        <aside className={`${active ? 'hidden md:flex' : 'flex'} w-full shrink-0 flex-col border-r border-line md:w-[380px]`}>
          {error ? <div className="p-4"><ErrorNote message={(error as Error).message} /></div> : null}
          <ChatList conversations={conversations ?? []} activeId={id} loading={isLoading} typing={typing}
            onSelect={(cid) => navigate(`/mensajes/${cid}`)} />
        </aside>
        <section className={`${active ? 'flex' : 'hidden md:flex'} min-w-0 flex-1`}>
          {active ? (
            <Thread key={active.id} conversation={active} meId={me.id} typingName={typing[active.id]} onBack={() => navigate('/mensajes')} />
          ) : (
            <div className="m-auto flex max-w-sm flex-col items-center gap-3 px-6 text-center">
              <span className="flex h-20 w-20 items-center justify-center rounded-full bg-ok-soft text-chat-accent"><MessageCircle className="h-10 w-10" /></span>
              <h2 className="text-2xl font-light">SisDoc Mensajes</h2>
              <p className="text-sm text-ink-soft">Envía mensajes y documentos a tus compañeros. Cada archivo compartido queda registrado con su versión y su historial de descargas.</p>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function Thread({ conversation, meId, typingName, onBack }: { conversation: ConversationDTO; meId: string; typingName?: string; onBack: () => void }) {
  const qc = useQueryClient();
  const { data: messages, isLoading } = useQuery({ queryKey: ['messages', conversation.id], queryFn: () => chatApi.messages(conversation.id) });
  const [text, setText] = useState('');
  const [attached, setAttached] = useState<Array<{ documentId: string; title: string }>>([]);
  const [picking, setPicking] = useState(false);
  const [info, setInfo] = useState(false);
  const [dlError, setDlError] = useState<string | null>(null);
  const end = useRef<HTMLDivElement>(null);
  const isGroup = conversation.type === 'GROUP';

  useEffect(() => { end.current?.scrollIntoView?.({ behavior: 'smooth' }); }, [messages?.length, typingName]);
  useEffect(() => { qc.invalidateQueries({ queryKey: ['conversations'] }); }, [qc, messages?.length]);

  const send = useMutation({
    mutationFn: () => chatApi.send(conversation.id, text.trim(), attached.map((a) => ({ documentId: a.documentId }))),
    onSuccess: (m) => {
      qc.setQueryData<MessageDTO[]>(['messages', conversation.id], (old) => [...(old ?? []), m]);
      qc.invalidateQueries({ queryKey: ['documents'] });
      setText(''); setAttached([]);
    },
  });

  async function open(a: AttachmentDTO) {
    setDlError(null);
    try { await filesApi.download(a.documentId, a.fileName, a.versionId, `chat:${conversation.id}`); }
    catch (e) { setDlError((e as ApiError).message); }
  }

  const status = (m: MessageDTO, i: number): Delivery => {
    const answered = messages!.slice(i + 1).some((x) => x.authorId !== meId);
    if (answered) return 'read';
    return Date.now() - new Date(m.createdAt).getTime() > 1500 ? 'delivered' : 'sent';
  };

  const subtitle = typingName ? <span className="font-medium text-chat-accent">escribiendo…</span>
    : isGroup ? conversation.members.map((m) => m.name.split(' ')[0]).join(', ')
    : conversation.online ? 'en línea' : conversation.lastSeen ? `últ. vez ${shortTime(conversation.lastSeen)}` : '';

  return (
    <>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-3 border-b border-line bg-paper px-3 py-2.5">
          <button className="icon-btn !bg-transparent md:hidden" onClick={onBack} aria-label="Volver a chats"><ArrowLeft className="h-5 w-5" /></button>
          <button className="flex min-w-0 flex-1 items-center gap-3 text-left" onClick={() => setInfo((v) => !v)} aria-label="Ver información del chat">
            <Avatar name={conversation.name} group={isGroup} online={isGroup ? undefined : conversation.online} />
            <span className="min-w-0">
              <span className="block truncate font-semibold leading-tight">{conversation.name}</span>
              <span className="block truncate text-xs text-ink-soft">{subtitle}</span>
            </span>
          </button>
          <button className="icon-btn !bg-transparent" aria-label="Videollamada" onClick={() => proto('Las videollamadas')}><Video className="h-5 w-5" /></button>
          <button className="icon-btn !bg-transparent" aria-label="Llamada" onClick={() => proto('Las llamadas')}><Phone className="h-5 w-5" /></button>
          <button className="icon-btn !bg-transparent hidden sm:inline-flex" aria-label="Buscar en el chat" onClick={() => proto('Buscar en el chat')}><Search className="h-5 w-5" /></button>
          <button className="icon-btn !bg-transparent" aria-label="Información" aria-pressed={info} onClick={() => setInfo((v) => !v)}><Info className="h-5 w-5" /></button>
        </header>

        <div className="chat-bg flex-1 space-y-1.5 overflow-y-auto px-3 py-4 sm:px-8" aria-live="polite">
          <p className="mx-auto mb-3 max-w-md rounded-lg bg-amber-soft px-3 py-1.5 text-center text-xs text-amber-ink shadow-card">
            🔒 Los documentos que se envían aquí quedan registrados: versión, quién los descargó y cuándo.
          </p>
          {isLoading && <div className="flex justify-center p-10 text-chat-accent"><Spinner /></div>}
          {messages?.map((m, i) => {
            const newDay = i === 0 || dayLabel(messages[i - 1].createdAt) !== dayLabel(m.createdAt);
            return (
              <Fragment key={m.id}>
                {newDay && <p className="mx-auto my-2 w-fit rounded-lg bg-surface/90 px-3 py-1 text-xs font-medium text-ink-soft shadow-card">{dayLabel(m.createdAt)}</p>}
                <MessageBubble m={m} mine={m.authorId === meId} group={isGroup} status={status(m, i)} onOpen={open} />
              </Fragment>
            );
          })}
          {typingName && (
            <div className="flex justify-start" aria-label={`${typingName} está escribiendo`}>
              <span className="flex items-center gap-1 rounded-lg rounded-tl-none bg-surface px-3.5 py-3 shadow-card">
                {[0, 1, 2].map((d) => <span key={d} style={{ animationDelay: `${d * 0.18}s` }} className="h-2 w-2 animate-dot rounded-full bg-ink-mute" />)}
              </span>
            </div>
          )}
          <div ref={end} />
        </div>

        {(dlError || send.error) && <div className="bg-paper px-3 pt-2"><ErrorNote message={dlError ?? (send.error as ApiError).message} /></div>}
        <ChatComposer text={text} setText={setText} attached={attached} sending={send.isPending}
          removeAttached={(id) => setAttached((x) => x.filter((y) => y.documentId !== id))}
          onPickDocument={() => setPicking(true)} onSend={() => send.mutate()} />
      </div>

      {info && (
        <div className="fixed inset-0 z-40 md:static md:inset-auto md:z-auto md:w-[340px] md:shrink-0 md:border-l md:border-line">
          <InfoPanel conversation={conversation} messages={messages ?? []} onClose={() => setInfo(false)} />
        </div>
      )}
      {picking && <AttachPicker chosen={attached.map((a) => a.documentId)} onClose={() => setPicking(false)}
        onPick={(d) => { setAttached((x) => [...x, d]); setPicking(false); }} />}
    </>
  );
}

function AttachPicker({ onPick, onClose, chosen }: { onPick: (d: { documentId: string; title: string }) => void; onClose: () => void; chosen: string[] }) {
  const { data, isLoading } = useQuery({ queryKey: ['documents'], queryFn: filesApi.list });
  // Solo se pueden adjuntar documentos que el usuario puede descargar (regla del backend).
  const options = (data ?? []).filter((d) => d.miPermiso !== 'VER' && !chosen.includes(d.id));
  return (
    <Modal title="Adjuntar documento" onClose={onClose}>
      <p className="mb-3 text-sm text-ink-soft">Los participantes recibirán permiso de descarga y quedará registrado en el historial del documento.</p>
      {isLoading && <div className="flex justify-center p-6 text-brand"><Spinner /></div>}
      <ul className="max-h-72 space-y-1 overflow-y-auto">
        {options.map((d) => (
          <li key={d.id}>
            <button className="flex w-full items-center gap-3 rounded-lg p-2.5 text-left hover:bg-paper" onClick={() => onPick({ documentId: d.id, title: d.nombreDocumento })}>
              <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-light text-brand"><FileTypeIcon mime={d.versionVigente.mimeType} className="h-5 w-5" /></span>
              <span className="min-w-0"><span className="block truncate text-sm font-semibold">{d.nombreDocumento}</span><span className="text-xs text-ink-mute">{d.codigo} · v{d.version} · {formatBytes(d.versionVigente.sizeBytes)}</span></span>
            </button>
          </li>
        ))}
      </ul>
      {!isLoading && options.length === 0 && <p className="py-6 text-center text-sm text-ink-mute">No tienes documentos disponibles para adjuntar.</p>}
    </Modal>
  );
}
