import { useQuery } from '@tanstack/react-query';
import { Check, CheckCheck, Clock, Pencil } from 'lucide-react';
import type { MessageDTO } from '@/shared/api/types';
import { fullStamp } from '@/shared/format';
import { ErrorNote, Modal, Spinner } from '@/shared/ui/primitives';
import { chatApi } from '../api/chat.api';

const STATUS_TEXT = { SENT: 'Enviado', DELIVERED: 'Entregado a todos', READ: 'Leído por todos' } as const;

/**
 * Trazabilidad de un mensaje propio: cuándo se envió, cuándo llegó y cuándo lo leyó cada destinatario
 * (fecha y hora con segundos), y cada edición con el texto anterior. Los datos salen del servidor, no del navegador.
 */
export function MessageInfoModal({ conversationId, message, onClose }: { conversationId: string; message: MessageDTO; onClose: () => void }) {
  const { data, isLoading, error } = useQuery({
    queryKey: ['trace', conversationId, message.id],
    queryFn: () => chatApi.trace(conversationId, message.id),
    staleTime: 0,
  });

  return (
    <Modal title="Información del mensaje" onClose={onClose}>
      <blockquote className="mb-4 rounded-lg border-l-4 border-chat-accent bg-paper px-3 py-2 text-sm">
        <span className="line-clamp-3 whitespace-pre-wrap break-words">{message.content || ((message.images?.length ?? 0) > 0 ? '📷 Foto' : '📄 Documento')}</span>
      </blockquote>

      {isLoading && <div className="flex justify-center p-6 text-chat-accent"><Spinner /></div>}
      <ErrorNote message={(error as Error | null)?.message} />

      {data && (
        <div className="space-y-4">
          <p className="flex items-center gap-2 text-sm">
            <Clock className="h-4 w-4 text-ink-mute" />
            <span className="font-semibold">Enviado:</span>
            <time dateTime={data.sentAt}>{fullStamp(data.sentAt)}</time>
            <span className="ml-auto rounded-full bg-ok-soft px-2.5 py-0.5 text-xs font-semibold text-chat-dark">{STATUS_TEXT[data.status]}</span>
          </p>

          {data.receipts.length === 0 ? (
            <p className="text-sm text-ink-mute">No hay destinatarios.</p>
          ) : (
            <table className="w-full text-left text-sm">
              <caption className="sr-only">Entrega y lectura por destinatario</caption>
              <thead>
                <tr className="border-b border-line text-xs uppercase tracking-wide text-ink-mute">
                  <th scope="col" className="py-1.5 pr-2 font-semibold">Destinatario</th>
                  <th scope="col" className="py-1.5 pr-2 font-semibold"><CheckCheck className="mr-1 inline h-3.5 w-3.5" />Entregado</th>
                  <th scope="col" className="py-1.5 font-semibold"><CheckCheck className="mr-1 inline h-3.5 w-3.5 text-chat-tick" />Leído</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {data.receipts.map((r) => (
                  <tr key={r.userId}>
                    <th scope="row" className="py-2 pr-2 font-medium">{r.userName}</th>
                    <td className="py-2 pr-2 tabular-nums">{r.deliveredAt ? <time dateTime={r.deliveredAt}>{fullStamp(r.deliveredAt)}</time> : <span className="text-ink-mute">Pendiente</span>}</td>
                    <td className="py-2 tabular-nums">{r.readAt ? <time dateTime={r.readAt}>{fullStamp(r.readAt)}</time> : <span className="text-ink-mute">Pendiente</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {data.edits.length > 0 && (
            <section aria-label="Historial de ediciones">
              <h3 className="mb-1.5 flex items-center gap-1.5 text-sm font-semibold"><Pencil className="h-4 w-4 text-ink-mute" /> Ediciones ({data.edits.length})</h3>
              <ol className="space-y-2">
                {data.edits.map((e, i) => (
                  <li key={e.at} className="rounded-lg bg-paper px-3 py-2 text-sm">
                    <time dateTime={e.at} className="block text-xs font-semibold tabular-nums text-ink-soft">{i + 1}.ª edición · {fullStamp(e.at)}</time>
                    <span className="block text-ink-soft">Antes: <span className="whitespace-pre-wrap break-words text-ink">{e.previousContent || '(sin texto)'}</span></span>
                  </li>
                ))}
              </ol>
            </section>
          )}
          <p className="flex items-center gap-1.5 text-xs text-ink-mute"><Check className="h-3.5 w-3.5" /> Las horas las registra el servidor y no se pueden modificar.</p>
        </div>
      )}
    </Modal>
  );
}
