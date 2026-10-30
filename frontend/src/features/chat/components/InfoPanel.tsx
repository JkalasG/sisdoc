import { BellOff, Ban, FileText, Trash2, X } from 'lucide-react';
import type { ConversationDTO, MessageDTO } from '@/shared/api/types';
import { formatBytes } from '@/shared/format';
import { Avatar, FileTypeIcon, proto } from '@/shared/ui/primitives';

export function InfoPanel({ conversation, messages, onClose }: { conversation: ConversationDTO; messages: MessageDTO[]; onClose: () => void }) {
  const docs = messages.flatMap((m) => m.attachments);
  const isGroup = conversation.type === 'GROUP';
  return (
    <aside className="flex h-full w-full flex-col overflow-y-auto bg-surface" aria-label="Información del chat">
      <header className="flex items-center gap-3 px-4 py-3.5">
        <button className="icon-btn !bg-transparent" onClick={onClose} aria-label="Cerrar información"><X className="h-5 w-5" /></button>
        <h2 className="text-base font-semibold">{isGroup ? 'Info. del grupo' : 'Info. del contacto'}</h2>
      </header>
      <div className="flex flex-col items-center gap-1 border-b-8 border-paper px-4 pb-5">
        <Avatar name={conversation.name} size="xl" group={isGroup} />
        <p className="mt-2 text-xl font-bold">{conversation.name}</p>
        <p className="text-sm text-ink-soft">{isGroup ? `Grupo · ${conversation.members.length} participantes` : conversation.members.find((m) => m.name === conversation.name)?.email}</p>
      </div>

      <section className="border-b-8 border-paper px-4 py-3">
        <h3 className="mb-2 flex items-center justify-between text-sm font-semibold text-ink-soft">Documentos compartidos <span>{docs.length}</span></h3>
        {docs.length === 0 && <p className="py-2 text-sm text-ink-mute">Aún no se han compartido documentos.</p>}
        <ul className="space-y-1">
          {docs.map((d) => (
            <li key={d.versionId} className="flex items-center gap-3 rounded-lg p-2 hover:bg-paper">
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-light text-brand"><FileTypeIcon mime={d.mimeType} className="h-4 w-4" /></span>
              <span className="min-w-0"><span className="block truncate text-sm font-semibold">{d.fileName}</span><span className="text-xs text-ink-mute">v{d.versionNumber} · {formatBytes(d.sizeBytes)}</span></span>
            </li>
          ))}
        </ul>
      </section>

      {isGroup && (
        <section className="border-b-8 border-paper px-4 py-3">
          <h3 className="mb-2 text-sm font-semibold text-ink-soft">{conversation.members.length} participantes</h3>
          <ul>
            {conversation.members.map((m) => (
              <li key={m.id} className="flex items-center gap-3 rounded-lg p-2"><Avatar name={m.name} size="sm" /><span className="text-sm font-medium">{m.name}</span></li>
            ))}
          </ul>
        </section>
      )}

      <section className="px-2 py-2 text-[15px]">
        <button className="flex w-full items-center gap-3 rounded-lg px-3 py-3 hover:bg-paper" onClick={() => proto('Silenciar chats')}><BellOff className="h-5 w-5 text-ink-soft" /> Silenciar notificaciones</button>
        <button className="flex w-full items-center gap-3 rounded-lg px-3 py-3 text-danger hover:bg-paper" onClick={() => proto('Bloquear contactos')}><Ban className="h-5 w-5" /> {isGroup ? 'Salir del grupo' : 'Bloquear'}</button>
        <button className="flex w-full items-center gap-3 rounded-lg px-3 py-3 text-danger hover:bg-paper" onClick={() => proto('Vaciar chats')}><Trash2 className="h-5 w-5" /> Vaciar chat</button>
      </section>
      <span className="sr-only"><FileText /></span>
    </aside>
  );
}
