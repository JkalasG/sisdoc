import { BellOff, MessageSquarePlus, MoreVertical, Pin, Search } from 'lucide-react';
import { useState } from 'react';
import type { ConversationDTO } from '@/shared/api/types';
import { shortTime } from '@/shared/format';
import { Avatar, proto, Spinner } from '@/shared/ui/primitives';

type Filter = 'all' | 'unread' | 'groups';
const FILTERS: Array<[Filter, string]> = [['all', 'Todos'], ['unread', 'No leídos'], ['groups', 'Grupos']];

export function ChatList({ conversations, activeId, onSelect, onNew, typing, loading }: {
  conversations: ConversationDTO[]; activeId?: string; onSelect: (id: string) => void; onNew: () => void;
  typing: Record<string, string>; loading: boolean;
}) {
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<Filter>('all');

  const rows = conversations
    .filter((c) => c.name.toLowerCase().includes(q.toLowerCase()))
    .filter((c) => filter === 'all' || (filter === 'unread' && c.unread > 0) || (filter === 'groups' && c.type === 'GROUP'))
    .sort((a, b) => Number(!!b.pinned) - Number(!!a.pinned) || (b.lastMessage?.at ?? '').localeCompare(a.lastMessage?.at ?? ''));

  return (
    <>
      <header className="flex items-center justify-between px-4 pb-2 pt-4">
        <h1 className="text-[22px]">Chats</h1>
        <div className="flex gap-1">
          <button className="icon-btn !bg-transparent" aria-label="Chat nuevo" onClick={onNew}><MessageSquarePlus className="h-5 w-5" /></button>
          <button className="icon-btn !bg-transparent" aria-label="Menú" onClick={() => proto('El menú de chats')}><MoreVertical className="h-5 w-5" /></button>
        </div>
      </header>
      <div className="px-3 pb-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-mute" />
          <input className="w-full rounded-full bg-paper py-2 pl-10 pr-4 text-sm placeholder:text-ink-mute focus:outline-none focus:ring-2 focus:ring-chat-accent/30"
            placeholder="Buscar o empezar un chat nuevo" aria-label="Buscar chats" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div className="mt-2.5 flex gap-2" role="tablist">
          {FILTERS.map(([id, label]) => (
            <button key={id} role="tab" aria-selected={filter === id} onClick={() => setFilter(id)}
              className={`rounded-full px-3.5 py-1 text-sm font-medium transition ${filter === id ? 'bg-ok-soft text-chat-dark' : 'bg-paper text-ink-soft hover:bg-line'}`}>{label}</button>
          ))}
        </div>
      </div>
      {loading && <div className="flex justify-center p-8 text-chat-accent"><Spinner /></div>}
      <ul className="flex-1 overflow-y-auto">
        {rows.map((c) => {
          const isTyping = typing[c.id];
          const active = c.id === activeId;
          return (
            <li key={c.id}>
              <button onClick={() => onSelect(c.id)} aria-current={active ? 'true' : undefined}
                className={`flex w-full items-center gap-3 px-3 py-2.5 text-left transition hover:bg-paper ${active ? 'bg-paper' : ''}`}>
                <Avatar name={c.name} size="lg" group={c.type === 'GROUP'} online={c.type === 'DIRECT' ? c.online : undefined} />
                <span className="min-w-0 flex-1 border-b border-line/70 pb-2.5">
                  <span className="flex items-baseline justify-between gap-2">
                    <span className="truncate text-[16px] font-semibold">{c.name}</span>
                    {c.lastMessage && <span className={`shrink-0 text-xs ${c.unread ? 'font-semibold text-chat-accent' : 'text-ink-mute'}`}>{shortTime(c.lastMessage.at)}</span>}
                  </span>
                  <span className="flex items-center justify-between gap-2">
                    <span className={`flex min-w-0 items-center gap-1 truncate text-sm ${isTyping ? 'font-medium text-chat-accent' : 'text-ink-soft'}`}>
                      {isTyping ? 'escribiendo…' : <span className="truncate">{c.lastMessage?.text ?? 'Sin mensajes'}</span>}
                    </span>
                    <span className="flex shrink-0 items-center gap-1.5 text-ink-mute">
                      {c.muted && <BellOff className="h-3.5 w-3.5" aria-label="Silenciado" />}
                      {c.pinned && !c.unread && <Pin className="h-3.5 w-3.5 rotate-45" aria-label="Fijado" />}
                      {c.unread > 0 && (
                        <span className={`flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[11px] font-bold text-white ${c.muted ? 'bg-ink-mute' : 'bg-chat-accent'}`}>{c.unread}</span>
                      )}
                    </span>
                  </span>
                </span>
              </button>
            </li>
          );
        })}
        {!loading && rows.length === 0 && (
          <li className="p-8 text-center text-sm text-ink-mute">
            {conversations.length === 0 ? 'Todavía no tienes chats.' : 'No hay chats que coincidan.'}{' '}
            <button className="font-semibold text-chat-accent underline" onClick={onNew}>Empieza uno nuevo</button>
          </li>
        )}
      </ul>
    </>
  );
}
