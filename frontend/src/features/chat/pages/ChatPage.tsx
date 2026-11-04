import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Info, MessageCircle, Phone, Search, Video } from 'lucide-react';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { filesApi } from '@/features/files/api/files.api';
import { useSession } from '@/features/auth/store/session';
import { ApiError } from '@/shared/api/http';
import { etiquetaDoc } from '@/shared/api/types';
import type { AttachmentDTO, ConversationDTO, ImageDTO, MessageDTO, QuoteDTO } from '@/shared/api/types';
import { dayLabel, formatBytes, shortTime } from '@/shared/format';
import { Avatar, ErrorNote, FileTypeIcon, Modal, Spinner, proto } from '@/shared/ui/primitives';
import { chatApi, subscribeToChat } from '../api/chat.api';
import { ChatComposer, StagedImage } from '../components/ChatComposer';
import { ImageViewer } from '../components/ImageViewer';
import { MessageInfoModal } from '../components/MessageInfoModal';
import { ChatList } from '../components/ChatList';
import { InfoPanel } from '../components/InfoPanel';
import { NewChatModal } from '../components/NewChatModal';
import { MessageBubble } from '../components/MessageBubble';
import { deliveryOf, editableIds } from '../lib/delivery';
import { appendMessage, applyEdit, applyReceipts, messagesKey, MessagesData, PREFETCH_AHEAD, useMessageHistory } from '../lib/message-history';
import { usePrefetchTrigger } from '../lib/use-prefetch-trigger';

export function ChatPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const me = useSession((s) => s.user)!;
  const [typing, setTyping] = useState<Record<string, string>>({});
  const [creating, setCreating] = useState(false);
  const { data: conversations, isLoading, error } = useQuery({ queryKey: ['conversations'], queryFn: chatApi.conversations });

  // Tiempo real: mensajes entrantes y «escribiendo…» sin recargar.
  useEffect(() => subscribeToChat({
    onMessage: (m) => {
      qc.setQueryData<MessagesData | undefined>(messagesKey(m.conversationId), (old) => appendMessage(old, m));
      qc.invalidateQueries({ queryKey: ['conversations'] });
    },
    onConversation: () => qc.invalidateQueries({ queryKey: ['conversations'] }),
    onReceipt: (u) => qc.setQueryData<MessagesData | undefined>(messagesKey(u.conversationId), (old) => applyReceipts(old, u)),
    onEdited: (m) => {
      qc.setQueryData<MessagesData | undefined>(messagesKey(m.conversationId), (old) => applyEdit(old, m));
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
            onSelect={(cid) => navigate(`/mensajes/${cid}`)} onNew={() => setCreating(true)} />
        </aside>
        <section className={`${active ? 'flex' : 'hidden md:flex'} min-w-0 flex-1`}>
          {active ? (
            <Thread key={active.id} conversation={active} meId={me.id} typingName={typing[active.id]} onBack={() => navigate('/mensajes')} />
          ) : (
            <div className="m-auto flex max-w-sm flex-col items-center gap-3 px-6 text-center">
              <span className="flex h-20 w-20 items-center justify-center rounded-full bg-ok-soft text-chat-accent"><MessageCircle className="h-10 w-10" /></span>
              <h2 className="text-2xl font-light">Iris Mensajes</h2>
              <p className="text-sm text-ink-soft">Envía mensajes y documentos a tus compañeros. Cada archivo compartido queda registrado con su versión y su historial de descargas.</p>
            </div>
          )}
        </section>
      </div>
      {creating && (
        <NewChatModal onClose={() => setCreating(false)}
          onOpen={(cid) => { setCreating(false); qc.invalidateQueries({ queryKey: ['conversations'] }); navigate(`/mensajes/${cid}`); }} />
      )}
    </div>
  );
}

function Thread({ conversation, meId, typingName, onBack }: { conversation: ConversationDTO; meId: string; typingName?: string; onBack: () => void }) {
  const qc = useQueryClient();
  const { messages, isLoading, hasOlder, loadingOlder, loadOlder } = useMessageHistory(conversation.id);
  const [text, setText] = useState('');
  const [attached, setAttached] = useState<Array<{ documentId: string; title: string }>>([]);
  const [picking, setPicking] = useState(false);
  const [info, setInfo] = useState(false);
  const [dlError, setDlError] = useState<string | null>(null);
  const [replyTo, setReplyTo] = useState<QuoteDTO | null>(null);
  const [editing, setEditing] = useState<{ id: string } | null>(null);
  const [staged, setStaged] = useState<StagedImage[]>([]);
  const [viewer, setViewer] = useState<{ images: ImageDTO[]; start: number } | null>(null);
  const [traced, setTraced] = useState<MessageDTO | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const jump = useRef<{ id: string; tries: number } | null>(null);
  const [jumpTick, setJumpTick] = useState(0);
  const end = useRef<HTMLDivElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const anchor = useRef<{ height: number; top: number } | null>(null); // para no perder el lugar al cargar páginas antiguas
  const nearBottom = useRef(true);
  const firstLoad = useRef(true);
  const isGroup = conversation.type === 'GROUP';

  const firstId = messages[0]?.id;
  const last = messages[messages.length - 1];

  // Precarga: al acercarse al borde superior de lo cargado (a PREFETCH_AHEAD mensajes), se pide la página anterior.
  const sentinel = usePrefetchTrigger({
    enabled: hasOlder && !loadingOlder, root: scroller,
    onNear: () => {
      const el = scroller.current;
      if (el) anchor.current = { height: el.scrollHeight, top: el.scrollTop };
      loadOlder();
    },
  });
  // Al llegar mensajes MÁS ANTIGUOS arriba, se compensa la altura nueva para que lo que se lee no salte.
  useLayoutEffect(() => {
    const el = scroller.current, a = anchor.current;
    if (el && a && !loadingOlder) { el.scrollTop = a.top + (el.scrollHeight - a.height); anchor.current = null; }
  }, [firstId, loadingOlder]);
  // Al final: primera carga siempre; después, solo si ya estabas abajo o el mensaje es tuyo (no te arranca de lo que lees).
  useEffect(() => {
    if (!last) return;
    if (firstLoad.current) { firstLoad.current = false; end.current?.scrollIntoView?.({ behavior: 'auto' }); return; }
    if (nearBottom.current || last.authorId === meId) end.current?.scrollIntoView?.({ behavior: 'smooth' });
  }, [last?.id, meId]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (typingName && nearBottom.current) end.current?.scrollIntoView?.({ behavior: 'smooth' }); }, [typingName]);
  // Mientras la conversación está abierta, lo que llega en vivo cuenta como leído (si no, el contador subiría sobre un chat que estás viendo).
  // «Leído» solo cuenta si de verdad lo estás viendo: con la pestaña oculta se espera a volver a ella.
  useEffect(() => {
    const mark = () => {
      if (document.visibilityState !== 'visible') return;
      chatApi.markRead(conversation.id).catch(() => undefined).finally(() => qc.invalidateQueries({ queryKey: ['conversations'] }));
    };
    mark();
    document.addEventListener('visibilitychange', mark);
    return () => document.removeEventListener('visibilitychange', mark);
  }, [qc, conversation.id, last?.id]);

  // Ir al mensaje original de una respuesta: si no está cargado, se piden páginas antiguas hasta encontrarlo.
  useEffect(() => {
    const j = jump.current;
    if (!j) return;
    const el = scroller.current?.querySelector(`[data-mid="${CSS.escape(j.id)}"]`);
    if (el) {
      el.scrollIntoView?.({ block: 'center', behavior: 'smooth' });
      setFlash(j.id); jump.current = null;
      return;
    }
    if (hasOlder && !loadingOlder && j.tries < 25) { j.tries++; loadOlder(); }
    else if (!hasOlder) { jump.current = null; setDlError('No se encontró el mensaje original.'); }
  }, [messages.length, hasOlder, loadingOlder, jumpTick]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!flash) return;
    const t = setTimeout(() => setFlash(null), 1800);
    return () => clearTimeout(t);
  }, [flash]);

  const send = useMutation({
    mutationFn: () => {
      const imageIds = staged.filter((i) => i.status === 'ready' && i.id).map((i) => i.id!);
      return chatApi.send(conversation.id, text.trim(), attached.map((a) => ({ documentId: a.documentId })), { replyToId: replyTo?.id, imageIds });
    },
    onSuccess: (m) => {
      qc.setQueryData<MessagesData | undefined>(messagesKey(conversation.id), (old) => appendMessage(old, m));
      qc.invalidateQueries({ queryKey: ['documents'] });
      staged.forEach((i) => i.preview.startsWith('blob:') && URL.revokeObjectURL(i.preview));
      setText(''); setAttached([]); setStaged([]); setReplyTo(null);
    },
  });

  const saveEdit = useMutation({
    mutationFn: () => chatApi.edit(conversation.id, editing!.id, text.trim()),
    onSuccess: (m) => {
      qc.setQueryData<MessagesData | undefined>(messagesKey(conversation.id), (old) => applyEdit(old, m));
      qc.invalidateQueries({ queryKey: ['conversations'] });
      setEditing(null); setText('');
    },
  });

  // Fotos: se validan aquí (tipo y tamaño) para dar un aviso rápido, pero el servidor las vuelve a validar por su contenido.
  const MAX_PHOTOS = 10, MAX_MB = 5;
  function pickImages(files: File[]) {
    const room = MAX_PHOTOS - staged.length;
    files.forEach((file, n) => {
      const key = `${Date.now()}-${n}-${file.name}`;
      const preview = typeof URL.createObjectURL === 'function' ? URL.createObjectURL(file) : '';
      const base = { key, name: file.name || 'foto', preview };
      if (n >= room) { setStaged((c) => [...c, { ...base, status: 'error', error: `Máximo ${MAX_PHOTOS} fotos por mensaje` }]); return; }
      if (!file.type.startsWith('image/')) { setStaged((c) => [...c, { ...base, status: 'error', error: 'No es una imagen' }]); return; }
      if (file.size > MAX_MB * 1024 * 1024) { setStaged((c) => [...c, { ...base, status: 'error', error: `Supera ${MAX_MB} MB` }]); return; }
      setStaged((c) => [...c, { ...base, status: 'uploading' }]);
      chatApi.uploadImage(conversation.id, file).then(
        (img) => setStaged((c) => c.map((x) => (x.key === key ? { ...x, status: 'ready', id: img.id } : x))),
        (e: ApiError) => setStaged((c) => c.map((x) => (x.key === key ? { ...x, status: 'error', error: e.message } : x))),
      );
    });
  }
  const removeImage = (key: string) => setStaged((c) => c.filter((x) => x.key !== key));

  const startReply = (m: MessageDTO) => {
    setEditing(null); setText('');
    setReplyTo({
      id: m.id, authorId: m.authorId, authorName: m.authorName,
      text: m.content?.trim() || ((m.images?.length ?? 0) > 0 ? 'Foto' : 'Documento'),
      kind: (m.images?.length ?? 0) > 0 ? 'IMAGE' : m.attachments.length > 0 ? 'DOCUMENT' : 'TEXT',
    });
  };
  const startEdit = (m: MessageDTO) => { setReplyTo(null); setStaged([]); setAttached([]); setEditing({ id: m.id }); setText(m.content ?? ''); };
  const cancelEdit = () => { setEditing(null); setText(''); };
  const editable = editableIds(messages, meId);
  const recipients = conversation.members.length - 1;

  async function open(a: AttachmentDTO) {
    setDlError(null);
    try { await filesApi.download(a.documentId, a.fileName, a.versionId, `chat:${conversation.id}`); }
    catch (e) { setDlError((e as ApiError).message); }
  }

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

        <div ref={scroller} data-testid="mensajes" style={{ overflowAnchor: 'none' }}
          onScroll={(e) => { const t = e.currentTarget; nearBottom.current = t.scrollHeight - t.scrollTop - t.clientHeight < 160; }}
          className="chat-bg flex-1 space-y-1.5 overflow-y-auto px-3 py-4 sm:px-8" aria-live="polite">
          {loadingOlder && <div className="flex justify-center py-2 text-chat-accent" role="status" aria-label="Cargando mensajes anteriores"><Spinner className="h-4 w-4" /></div>}
          {!hasOlder && !isLoading && (
            <p className="mx-auto mb-3 max-w-md rounded-lg bg-amber-soft px-3 py-1.5 text-center text-xs text-amber-ink shadow-card">
              🔒 Los documentos que se envían aquí quedan registrados: versión, quién los descargó y cuándo.
            </p>
          )}
          {isLoading && <div className="flex justify-center p-10 text-chat-accent"><Spinner /></div>}
          {messages.map((m, i) => {
            const newDay = i === 0 || dayLabel(messages[i - 1].createdAt) !== dayLabel(m.createdAt);
            return (
              <div key={m.id} data-mid={m.id} ref={i === Math.min(PREFETCH_AHEAD, messages.length - 1) ? sentinel : undefined} className="space-y-1.5">
                {newDay && <p className="mx-auto my-2 w-fit rounded-lg bg-surface/90 px-3 py-1 text-xs font-medium text-ink-soft shadow-card">{dayLabel(m.createdAt)}</p>}
                <MessageBubble m={m} mine={m.authorId === meId} group={isGroup} status={deliveryOf(m, recipients)} onOpen={open}
                  conversationId={conversation.id} canEdit={editable.has(m.id) && !!m.content} highlight={flash === m.id}
                  onReply={startReply} onEdit={startEdit} onInfo={setTraced}
                  onJump={(id) => { jump.current = { id, tries: 0 }; setFlash(null); setDlError(null); setJumpTick((n) => n + 1); }}
                  onOpenImage={(images, start) => setViewer({ images, start })} />
              </div>
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

        {(dlError || send.error || saveEdit.error) && <div className="bg-paper px-3 pt-2"><ErrorNote message={dlError ?? ((send.error ?? saveEdit.error) as ApiError).message} /></div>}
        <ChatComposer text={text} setText={setText} attached={attached} sending={send.isPending || saveEdit.isPending}
          removeAttached={(id) => setAttached((x) => x.filter((y) => y.documentId !== id))}
          onPickDocument={() => setPicking(true)} onSend={() => (editing ? saveEdit.mutate() : send.mutate())}
          images={staged} onPickImages={pickImages} removeImage={removeImage}
          replyTo={replyTo} onCancelReply={() => setReplyTo(null)} editing={editing} onCancelEdit={cancelEdit} />
      </div>

      {info && (
        <div className="fixed inset-0 z-40 md:static md:inset-auto md:z-auto md:w-[340px] md:shrink-0 md:border-l md:border-line">
          <InfoPanel conversation={conversation} messages={messages} onClose={() => setInfo(false)} />
        </div>
      )}
      {viewer && <ImageViewer conversationId={conversation.id} images={viewer.images} start={viewer.start} onClose={() => setViewer(null)} />}
      {traced && <MessageInfoModal conversationId={conversation.id} message={traced} onClose={() => setTraced(null)} />}
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
              <span className="min-w-0"><span className="block truncate text-sm font-semibold">{d.nombreDocumento}</span><span className="text-xs text-ink-mute">{d.codigo} · v{etiquetaDoc(d)} · {formatBytes(d.versionVigente.sizeBytes)}</span></span>
            </button>
          </li>
        ))}
      </ul>
      {!isLoading && options.length === 0 && <p className="py-6 text-center text-sm text-ink-mute">No tienes documentos disponibles para adjuntar.</p>}
    </Modal>
  );
}
