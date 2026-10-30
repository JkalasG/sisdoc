import { http, json } from '@/shared/api/http';
import { config } from '@/shared/config';
import type { ConversationDTO, MessageDTO } from '@/shared/api/types';

// ⚠ Hoy el backend de chat solo expone el socket (message:send). PENDIENTES en backend:
//   GET /conversations · GET /conversations/:id/messages · POST /conversations/:id/messages
export const chatApi = {
  conversations: () => http<ConversationDTO[]>('/conversations'),
  messages: (id: string) => http<MessageDTO[]>(`/conversations/${id}/messages`),
  send: (id: string, content: string, attachments: Array<{ documentId: string }>) =>
    http<MessageDTO>(`/conversations/${id}/messages`, { method: 'POST', ...json({ content, attachments }) }),
};

export interface ChatHandlers {
  onMessage: (m: MessageDTO) => void;
  onTyping?: (t: { conversationId: string; name: string; on: boolean }) => void;
}

/** Tiempo real: en modo mock usa un bus local; en real, Socket.IO con la cookie de sesión. */
export function subscribeToChat({ onMessage, onTyping }: ChatHandlers): () => void {
  if (config.useMocks) {
    let off = () => {};
    let closed = false;
    import('@/shared/api/mock/router').then(({ mockBus }) => {
      if (closed) return;
      off = mockBus.on((e) => (e.type === 'message:new' ? onMessage(e.message) : onTyping?.(e)));
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
  });
  return () => { closed = true; socket?.disconnect(); };
}
