import { clampPageSize, decodeCursor, encodeCursor, MESSAGE_PAGE } from './message-cursor';

describe('Cursor de paginación del historial', () => {
  const c = { at: new Date('2026-03-02T10:00:00.123Z'), id: '8a1f6c1e-2b7d-4c0a-9d53-1f2e3a4b5c6d' };
  const b64 = (s: string) => Buffer.from(s).toString('base64url');

  it('ida y vuelta conserva el instante (ms) y el id', () => {
    expect(decodeCursor(encodeCursor(c))).toEqual(c);
  });

  it.each([
    ['basura', 'no-es-base64-valido!!'],
    ['sin id', b64('2026-03-02T10:00:00.123Z|')],
    ['fecha imposible', b64('2026-13-45T10:00:00.123Z|abcdef12')],
    ['inyección', b64("2026-03-02T10:00:00.123Z|x' OR 1=1")],
    ['demasiado largo', 'A'.repeat(500)],
  ])('rechaza un cursor inválido: %s', (_n, raw) => {
    expect(decodeCursor(raw)).toBeNull();
  });

  it('acota el tamaño de página', () => {
    expect(clampPageSize()).toBe(MESSAGE_PAGE.default);
    expect(clampPageSize(0)).toBe(MESSAGE_PAGE.default);
    expect(clampPageSize(NaN)).toBe(MESSAGE_PAGE.default);
    expect(clampPageSize(10)).toBe(10);
    expect(clampPageSize(9999)).toBe(MESSAGE_PAGE.max);
  });
});
