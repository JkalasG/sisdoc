import { describe, expect, it } from 'vitest';
import type { MessageDTO, ReceiptDTO, ReceiptUpdateDTO } from '@/shared/api/types';
import { deliveryOf, editableIds } from './delivery';
import { appendMessage, applyEdit, applyReceipts, flatten, MessagesData } from './message-history';
import { EMOJI_CATEGORIES, searchEmojis } from '../components/emoji-data';

const T = '2026-03-02T10:00:00.000Z';
const rc = (userId: string, delivered: boolean, read: boolean): ReceiptDTO => ({ userId, userName: userId, deliveredAt: delivered ? T : null, readAt: read ? T : null });
const msg = (id: string, over: Partial<MessageDTO> = {}): MessageDTO => ({ id, conversationId: 'c', authorId: 'me', authorName: 'Yo', content: id, attachments: [], createdAt: T, ...over });
const data = (...items: MessageDTO[]): MessagesData => ({ pages: [{ items, nextCursor: null }], pageParams: [undefined] });

describe('Estado de entrega para quien envía', () => {
  it('Enviado hasta que le llegue a todos; Entregado hasta que lo lean todos; luego Leído', () => {
    expect(deliveryOf({ receipts: [] }, 1)).toBe('sent');
    expect(deliveryOf({}, 1)).toBe('sent');
    expect(deliveryOf({ receipts: [rc('a', false, false)] }, 1)).toBe('sent');
    expect(deliveryOf({ receipts: [rc('a', true, false), rc('b', false, false)] }, 2)).toBe('sent');
    expect(deliveryOf({ receipts: [rc('a', true, false), rc('b', true, false)] }, 2)).toBe('delivered');
    expect(deliveryOf({ receipts: [rc('a', true, true), rc('b', true, false)] }, 2)).toBe('delivered');
    expect(deliveryOf({ receipts: [rc('a', true, true), rc('b', true, true)] }, 2)).toBe('read');
  });

  it('si faltan acuses de algún destinatario (aún no llegó la novedad), no se adelanta el estado', () => {
    expect(deliveryOf({ receipts: [rc('a', true, true)] }, 2)).toBe('sent');
    expect(deliveryOf({ receipts: [rc('a', true, true)] }, 0)).toBe('sent');
  });
});

describe('Editables: los últimos 3 mensajes propios', () => {
  it('ignora los de otras personas y respeta el orden cronológico', () => {
    const list = [msg('1'), msg('2', { authorId: 'otro' }), msg('3'), msg('4'), msg('5', { authorId: 'otro' }), msg('6')];
    expect([...editableIds(list, 'me')].sort()).toEqual(['3', '4', '6']);
    expect(editableIds([msg('1')], 'me').size).toBe(1);
    expect(editableIds([], 'me').size).toBe(0);
  });
});

describe('Novedades en vivo sobre la caché', () => {
  const upd = (over: Partial<ReceiptUpdateDTO> = {}): ReceiptUpdateDTO => ({
    conversationId: 'c', userId: 'luis', userName: 'Luis', items: [{ messageId: 'm1', deliveredAt: T, readAt: null }], ...over,
  });

  it('crea el acuse de quien aún no estaba y completa el de quien sí', () => {
    let d = applyReceipts(data(msg('m1')), upd())!;
    expect(flatten(d)[0].receipts).toEqual([{ userId: 'luis', userName: 'Luis', deliveredAt: T, readAt: null }]);
    d = applyReceipts(d, upd({ items: [{ messageId: 'm1', deliveredAt: T, readAt: '2026-03-02T10:05:00.000Z' }] }))!;
    expect(flatten(d)[0].receipts).toEqual([{ userId: 'luis', userName: 'Luis', deliveredAt: T, readAt: '2026-03-02T10:05:00.000Z' }]);
  });

  it('la primera hora registrada no se reemplaza por una posterior', () => {
    const d = applyReceipts(data(msg('m1', { receipts: [rc('luis', true, true)] })), upd({ userName: 'luis', items: [{ messageId: 'm1', deliveredAt: '2030-01-01T00:00:00.000Z', readAt: '2030-01-01T00:00:00.000Z' }] }))!;
    expect(flatten(d)[0].receipts).toEqual([rc('luis', true, true)]);
  });

  it('no inventa mensajes que no están cargados y no cambia las otras páginas', () => {
    const base = data(msg('m1'));
    expect(applyReceipts(base, upd({ items: [{ messageId: 'no-esta', deliveredAt: T, readAt: null }] }))).toBe(base);
    expect(applyReceipts(undefined, upd())).toBeUndefined();
  });

  it('una edición en vivo cambia texto y fecha, pero conserva MIS acuses (lo difundido no los trae)', () => {
    const base = data(msg('m1', { receipts: [rc('luis', true, false)] }));
    const out = flatten(applyEdit(base, msg('m1', { content: 'nuevo texto', editedAt: T }))!)[0];
    expect(out).toMatchObject({ content: 'nuevo texto', editedAt: T });
    expect(out.receipts).toEqual([rc('luis', true, false)]);
  });

  it('si el mensaje ya llegó por el tiempo real sin acuses y luego llega la respuesta con ellos, se completan', () => {
    const live = data(msg('m1'));
    const out = flatten(appendMessage(live, msg('m1', { receipts: [rc('luis', false, false)] }))!);
    expect(out).toHaveLength(1);
    expect(out[0].receipts).toHaveLength(1);
    const again = appendMessage(appendMessage(live, msg('m1', { receipts: [rc('luis', false, false)] })), msg('m1', { receipts: [rc('otro', true, true)] }))!;
    expect(flatten(again)[0].receipts).toEqual([rc('luis', false, false)]); // lo ya presente no se pisa
  });
});

describe('Emojis', () => {
  it('hay un catálogo amplio y variado, sin repetidos dentro de cada categoría', () => {
    const total = EMOJI_CATEGORIES.reduce((n, c) => n + c.emojis.length, 0);
    expect(total).toBeGreaterThan(300);
    expect(EMOJI_CATEGORIES.length).toBeGreaterThanOrEqual(6);
    for (const c of EMOJI_CATEGORIES) expect(new Set(c.emojis.map(([e]) => e)).size).toBe(c.emojis.length);
  });

  it('la búsqueda ignora tildes y mayúsculas, no repite y no devuelve nada con texto vacío', () => {
    expect(searchEmojis('')).toEqual([]);
    expect(searchEmojis('   ')).toEqual([]);
    expect(searchEmojis('FUEGO').map(([e]) => e)).toContain('🔥');
    expect(searchEmojis('corazón').length).toBe(searchEmojis('corazon').length);
    const found = searchEmojis('corazon').map(([e]) => e);
    expect(new Set(found).size).toBe(found.length);
    expect(searchEmojis('gracias').map(([e]) => e)).toContain('🙏');
    expect(searchEmojis('zzzzqq')).toEqual([]);
  });
});
