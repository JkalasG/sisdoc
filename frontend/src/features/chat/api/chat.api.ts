import { http, json } from '@/shared/api/http';
import { config } from '@/shared/config';
import type { ConversationDTO, ImageDTO, MessageDTO, MessagePageDTO, MessageTraceDTO, ReceiptUpdateDTO, UserLite } from '@/shared/api/types';

export const chatApi = {
  conversations: () => http<ConversationDTO[]>('/conversations'),
  /** Personas con las que se puede chatear (activas; nunca uno mismo). */
  contacts: (q?: string) => http<UserLite[]>(`/conversations/contacts${q ? `?q=${encodeURIComponent(q)}` : ''}`),
  /** Chat directo (si ya existe, devuelve ese con `created: false`) o grupo. */
  createConversation: (body: { type: 'DIRECT' | 'GROUP'; memberIds: string[]; name?: string }) =>
    http<{ created: boolean; conversation: ConversationDTO }>('/conversations', { method: 'POST', ...json(body) }),
  markRead: (id: string) => http<void>(`/conversations/${id}/read`, { method: 'POST' }),
  /** Una página del historial, de la más reciente hacia atrás: sin `before` trae las últimas; con él, las anteriores a ese cursor. */
  messages: (id: string, before?: string, limit = 20) =>
    http<MessagePageDTO>(`/conversations/${id}/messages?limit=${limit}${before ? `&before=${encodeURIComponent(before)}` : ''}`),
  send: (id: string, content: string, attachments: Array<{ documentId: string }>, extra: { replyToId?: string; imageIds?: string[] } = {}) =>
    http<MessageDTO>(`/conversations/${id}/messages`, { method: 'POST', ...json({ content, attachments, ...extra }) }),
  /** Edita el texto de uno de MIS últimos 3 mensajes de la conversación. */
  edit: (id: string, messageId: string, content: string) =>
    http<MessageDTO>(`/conversations/${id}/messages/${messageId}`, { method: 'PATCH', ...json({ content }) }),
  /** Enviado / entregado / leído por destinatario con fecha y hora, y ediciones. Solo para quien envió el mensaje. */
  trace: (id: string, messageId: string) => http<MessageTraceDTO>(`/conversations/${id}/messages/${messageId}/trace`),
  /** Sube una imagen; queda en espera hasta que se envía el mensaje que la lleva. */
  uploadImage: (id: string, file: File) => {
    const form = new FormData();
    form.append('file', file);
    return http<ImageDTO>(`/conversations/${id}/images`, { method: 'POST', body: form });
  },
};

/** Dirección de la imagen para un <img>: va con la cookie de sesión (el servidor solo la entrega a miembros). */
export const imageUrl = (conversationId: string, image: ImageDTO) =>
  image.url ?? `${config.apiUrl}/conversations/${conversationId}/images/${image.id}`;

export interface ChatHandlers {
  onMessage: (m: MessageDTO) => void;
  onTyping?: (t: { conversationId: string; name: string; on: boolean }) => void;
  /** Alguien te agregó a una conversación nueva: hay que refrescar la lista. */
  onConversation?: () => void;
  /** Alguien recibió o leyó mensajes míos: llegan sus fechas y horas. */
  onReceipt?: (u: ReceiptUpdateDTO) => void;
  /** Se editó un mensaje de la conversación. */
  onEdited?: (m: MessageDTO) => void;
}

/** Tiempo real: en modo mock usa un bus local; en real, Socket.IO con la cookie de sesión. */
export function subscribeToChat({ onMessage, onTyping, onConversation, onReceipt, onEdited }: ChatHandlers): () => void {
  if (config.useMocks) {
    let off = () => {};
    let closed = false;
    import('@/shared/api/mock/router').then(({ mockBus }) => {
      if (closed) return;
      off = mockBus.on((e) => {
        if (e.type === 'message:new') onMessage(e.message);
        else if (e.type === 'receipt:update') onReceipt?.(e.update);
        else if (e.type === 'message:edited') onEdited?.(e.message);
        else onTyping?.(e);
      });
    });
    return () => { closed = true; off(); };
  }

  let socket: import('socket.io-client').Socket | undefined;
  let closed = false;
  import('socket.io-client').then(({ io }) => {
    if (closed) return;
    socket = io('/chat', { withCredentials: true });
    socket.on('message:new', onMessage);
    socket.on('typing', (t) => onTyping?.(t));
    socket.on('conversation:new', () => onConversation?.());
    socket.on('receipt:update', (u) => onReceipt?.(u));
    socket.on('message:edited', (m) => onEdited?.(m));
  });
  return () => { closed = true; socket?.disconnect(); };
}
