import { useMutation, useQuery } from '@tanstack/react-query';
import { Search, Users } from 'lucide-react';
import { useEffect, useState } from 'react';
import { ApiError } from '@/shared/api/http';
import type { UserLite } from '@/shared/api/types';
import { Avatar, ErrorNote, Modal, Spinner } from '@/shared/ui/primitives';
import { chatApi } from '../api/chat.api';

const MIN_OTHERS = 2; // un grupo necesita al menos 2 personas además de ti (mismas reglas del servidor)
const MAX_NAME = 80;

/** Iniciar un chat con una persona (si ya hay uno, se abre ese) o crear un grupo. */
export function NewChatModal({ onClose, onOpen }: { onClose: () => void; onOpen: (conversationId: string) => void }) {
  const [mode, setMode] = useState<'DIRECT' | 'GROUP'>('DIRECT');
  const [q, setQ] = useState('');
  const [debounced, setDebounced] = useState('');
  const [picked, setPicked] = useState<UserLite[]>([]);
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(q.trim()), 250);
    return () => clearTimeout(t);
  }, [q]);

  const contacts = useQuery({ queryKey: ['contacts', debounced], queryFn: () => chatApi.contacts(debounced), placeholderData: (prev) => prev });

  const create = useMutation({
    mutationFn: (body: { type: 'DIRECT' | 'GROUP'; memberIds: string[]; name?: string }) => chatApi.createConversation(body),
    onSuccess: (r) => onOpen(r.conversation.id),
    onError: (e) => setError((e as ApiError).message),
  });

  const toggle = (u: UserLite) => setPicked((cur) => (cur.some((x) => x.id === u.id) ? cur.filter((x) => x.id !== u.id) : [...cur, u]));
  const canCreateGroup = name.trim().length >= 2 && picked.length >= MIN_OTHERS && !create.isPending;
  const rows = contacts.data ?? [];

  return (
    <Modal title="Chat nuevo" onClose={onClose}
      footer={mode === 'GROUP' ? (
        <>
          <button className="btn-ghost" onClick={onClose}>Cancelar</button>
          <button className="btn-primary" disabled={!canCreateGroup}
            onClick={() => { setError(null); create.mutate({ type: 'GROUP', memberIds: picked.map((p) => p.id), name: name.trim() }); }}>
            {create.isPending ? <Spinner className="h-4 w-4" /> : 'Crear grupo'}
          </button>
        </>
      ) : undefined}>
      <div className="space-y-3">
        <div className="flex gap-2" role="tablist" aria-label="Tipo de chat">
          {([['DIRECT', 'Persona'], ['GROUP', 'Grupo nuevo']] as const).map(([id, label]) => (
            <button key={id} role="tab" aria-selected={mode === id} onClick={() => { setMode(id); setError(null); }}
              className={`rounded-full px-3.5 py-1 text-sm font-medium transition ${mode === id ? 'bg-ok-soft text-chat-dark' : 'bg-paper text-ink-soft hover:bg-line'}`}>{label}</button>
          ))}
        </div>

        {mode === 'GROUP' && (
          <div>
            <label className="label" htmlFor="group-name">Nombre del grupo</label>
            <input id="group-name" className="field" maxLength={MAX_NAME} placeholder="Ej. Proyecto Piloto" value={name} onChange={(e) => setName(e.target.value)} />
            <p className="mt-1 text-xs text-ink-mute">
              {picked.length === 0 ? `Elige al menos ${MIN_OTHERS} personas.` : `${picked.length} ${picked.length === 1 ? 'persona elegida' : 'personas elegidas'}${picked.length < MIN_OTHERS ? ` (faltan ${MIN_OTHERS - picked.length})` : ''}.`}
            </p>
          </div>
        )}

        <div className="relative">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-mute" />
          <input className="w-full rounded-full bg-paper py-2 pl-10 pr-4 text-sm placeholder:text-ink-mute focus:outline-none focus:ring-2 focus:ring-chat-accent/30"
            placeholder="Buscar por nombre o correo" aria-label="Buscar persona" value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
        </div>

        <ErrorNote message={error ?? (contacts.error as Error | null)?.message} />

        {contacts.isLoading ? (
          <div className="flex justify-center p-6 text-chat-accent"><Spinner /></div>
        ) : (
          <ul className="max-h-72 divide-y divide-line overflow-y-auto rounded-lg border border-line" aria-label="Personas">
            {rows.map((u) => {
              const on = picked.some((x) => x.id === u.id);
              return (
                <li key={u.id}>
                  {mode === 'DIRECT' ? (
                    <button className="flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-paper disabled:opacity-50" disabled={create.isPending}
                      onClick={() => { setError(null); create.mutate({ type: 'DIRECT', memberIds: [u.id] }); }}>
                      <Avatar name={u.name} />
                      <span className="min-w-0"><span className="block truncate font-semibold">{u.name}</span><span className="block truncate text-xs text-ink-soft">{u.email}</span></span>
                    </button>
                  ) : (
                    <label className="flex cursor-pointer items-center gap-3 px-3 py-2.5 hover:bg-paper">
                      <input type="checkbox" checked={on} onChange={() => toggle(u)} aria-label={u.name} />
                      <Avatar name={u.name} />
                      <span className="min-w-0"><span className="block truncate font-semibold">{u.name}</span><span className="block truncate text-xs text-ink-soft">{u.email}</span></span>
                    </label>
                  )}
                </li>
              );
            })}
            {rows.length === 0 && (
              <li className="flex items-center gap-2 p-5 text-sm text-ink-mute"><Users className="h-4 w-4" /> Nadie coincide con la búsqueda.</li>
            )}
          </ul>
        )}
      </div>
    </Modal>
  );
}
