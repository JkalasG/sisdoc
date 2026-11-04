import { InfiniteData, useInfiniteQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import type { MessageDTO, MessagePageDTO, ReceiptUpdateDTO } from '@/shared/api/types';
import { chatApi } from '../api/chat.api';

/** Mensajes por página: ~10 a la vista + ~10 ya cargados por encima, listos antes de llegar a ellos. */
export const PAGE_SIZE = 20;
/** Al acercarse a este número de mensajes del borde superior cargado, se pide la página anterior (precarga). */
export const PREFETCH_AHEAD = 10;

/** `pages[0]` es la más reciente; cada página siguiente es más antigua (cursor hacia atrás). */
export type MessagesData = InfiniteData<MessagePageDTO, unknown>;
export const messagesKey = (conversationId: string) => ['messages', conversationId] as const;

/** Todo lo cargado, en orden cronológico. */
export const flatten = (d?: MessagesData): MessageDTO[] =>
  d ? [...d.pages].reverse().flatMap((p) => p.items) : [];

/** Agrega un mensaje nuevo (propio o en vivo) a la página más reciente, sin duplicarlo. Sin caché cargada no hace nada. */
export function appendMessage(old: MessagesData | undefined, m: MessageDTO): MessagesData | undefined {
  if (!old || old.pages.length === 0) return old;
  if (old.pages.some((p) => p.items.some((x) => x.id === m.id))) {
    // Ya estaba (llegó antes por el tiempo real): si ahora traemos los acuses que el difundido no lleva, se completan.
    return m.receipts ? patchMessage(old, m.id, (x) => (x.receipts ? x : { ...x, receipts: m.receipts })) : old;
  }
  const [newest, ...rest] = old.pages;
  return { ...old, pages: [{ ...newest, items: [...newest.items, m] }, ...rest] };
}

/** Cambia un mensaje ya cargado (en la página donde esté) sin tocar el resto. */
export function patchMessage(old: MessagesData | undefined, id: string, fn: (m: MessageDTO) => MessageDTO): MessagesData | undefined {
  if (!old) return old;
  let touched = false;
  const pages = old.pages.map((p) => {
    if (!p.items.some((x) => x.id === id)) return p;
    touched = true;
    return { ...p, items: p.items.map((x) => (x.id === id ? fn(x) : x)) };
  });
  return touched ? { ...old, pages } : old;
}

/** Una edición en vivo: cambia texto y fecha de edición, pero conserva mis acuses (el difundido no los trae). */
export function applyEdit(old: MessagesData | undefined, edited: MessageDTO): MessagesData | undefined {
  return patchMessage(old, edited.id, (x) => ({ ...x, content: edited.content, editedAt: edited.editedAt }));
}

/** Entrega/lectura en vivo: completa o actualiza el acuse de esa persona. Una hora ya registrada no se reemplaza. */
export function applyReceipts(old: MessagesData | undefined, u: ReceiptUpdateDTO): MessagesData | undefined {
  let data = old;
  for (const item of u.items) {
    data = patchMessage(data, item.messageId, (m) => {
      const list = m.receipts ?? [];
      const mine = list.find((r) => r.userId === u.userId);
      const next = {
        userId: u.userId, userName: u.userName,
        deliveredAt: mine?.deliveredAt ?? item.deliveredAt, readAt: mine?.readAt ?? item.readAt,
      };
      return { ...m, receipts: mine ? list.map((r) => (r.userId === u.userId ? next : r)) : [...list, next] };
    });
  }
  return data;
}

/** Historial paginado hacia atrás: carga lo más reciente y pide páginas más antiguas bajo demanda. */
export function useMessageHistory(conversationId: string) {
  const q = useInfiniteQuery({
    queryKey: messagesKey(conversationId),
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) => chatApi.messages(conversationId, pageParam),
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    // Lo nuevo llega por el socket; reconsultar TODAS las páginas al volver a la pestaña sería caro.
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });
  const messages = useMemo(() => flatten(q.data), [q.data]);
  return {
    messages,
    isLoading: q.isLoading,
    error: q.error as Error | null,
    hasOlder: !!q.hasNextPage,
    loadingOlder: q.isFetchingNextPage,
    loadOlder: () => { if (q.hasNextPage && !q.isFetchingNextPage) void q.fetchNextPage(); },
  };
}
