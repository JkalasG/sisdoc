/**
 * Cursor de paginación por claves (keyset) del historial: identifica un mensaje por (fecha, id).
 * A diferencia de OFFSET, el costo de pedir una página no crece con la profundidad y no se repiten
 * ni se saltan mensajes cuando llegan nuevos mientras se navega.
 */
export interface MessageCursor { at: Date; id: string }

/** Tamaños de página del historial: lo visible y un colchón precargado por encima. */
export const MESSAGE_PAGE = { default: 20, max: 50 } as const;

const SHAPE = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z)\|([0-9a-fA-F-]{8,64})$/;

export function encodeCursor(c: MessageCursor): string {
  return Buffer.from(`${c.at.toISOString()}|${c.id}`, 'utf8').toString('base64url');
}

/** `null` si el cursor no es válido (el cliente lo manipuló o es de otra versión). */
export function decodeCursor(raw: string): MessageCursor | null {
  if (raw.length > 120) return null;
  const m = SHAPE.exec(Buffer.from(raw, 'base64url').toString('utf8'));
  if (!m) return null;
  const at = new Date(m[1]);
  return Number.isNaN(at.getTime()) ? null : { at, id: m[2] };
}

export function clampPageSize(requested?: number): number {
  if (!Number.isFinite(requested) || !requested || requested < 1) return MESSAGE_PAGE.default;
  return Math.min(Math.floor(requested), MESSAGE_PAGE.max);
}
