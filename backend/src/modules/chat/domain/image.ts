/**
 * Imágenes del chat: se identifican por su CONTENIDO (firma de bytes), nunca por el nombre ni el tipo que declara
 * el cliente. Solo formatos de mapa de bits; SVG queda fuera a propósito (puede traer scripts).
 */
export const IMAGE_LIMITS = {
  maxBytes: 5 * 1024 * 1024,
  maxPerMessage: 10,
  /** Subidas aún no enviadas que una persona puede tener en una conversación (evita llenar el disco sin enviar nada). */
  maxStagedPerConversation: 20,
  maxSide: 8000,
  maxPixels: 40_000_000,
} as const;

export type ImageMime = 'image/png' | 'image/jpeg' | 'image/gif' | 'image/webp';
export interface ImageInfo { mimeType: ImageMime; width: number; height: number }

const u16be = (b: Buffer, o: number) => b.readUInt16BE(o);
const u16le = (b: Buffer, o: number) => b.readUInt16LE(o);
const u24le = (b: Buffer, o: number) => b[o] | (b[o + 1] << 8) | (b[o + 2] << 16);

function png(b: Buffer): ImageInfo | null {
  if (b.length < 24 || b.readUInt32BE(0) !== 0x89504e47 || b.readUInt32BE(4) !== 0x0d0a1a0a) return null;
  if (b.toString('latin1', 12, 16) !== 'IHDR') return null;
  return { mimeType: 'image/png', width: b.readUInt32BE(16), height: b.readUInt32BE(20) };
}

function gif(b: Buffer): ImageInfo | null {
  if (b.length < 10) return null;
  const head = b.toString('latin1', 0, 6);
  return head === 'GIF87a' || head === 'GIF89a' ? { mimeType: 'image/gif', width: u16le(b, 6), height: u16le(b, 8) } : null;
}

function jpeg(b: Buffer): ImageInfo | null {
  if (b.length < 4 || b[0] !== 0xff || b[1] !== 0xd8 || b[2] !== 0xff) return null;
  let i = 2;
  while (i + 4 <= b.length) {
    if (b[i] !== 0xff) { i++; continue; }
    const marker = b[i + 1];
    if (marker === 0xff) { i++; continue; }
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) { i += 2; continue; } // sin longitud
    const isSof = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
    if (isSof) {
      if (i + 9 > b.length) return null;
      return { mimeType: 'image/jpeg', height: u16be(b, i + 5), width: u16be(b, i + 7) };
    }
    i += 2 + u16be(b, i + 2);
  }
  return null;
}

function webp(b: Buffer): ImageInfo | null {
  if (b.length < 30 || b.toString('latin1', 0, 4) !== 'RIFF' || b.toString('latin1', 8, 12) !== 'WEBP') return null;
  const kind = b.toString('latin1', 12, 16);
  if (kind === 'VP8 ') return { mimeType: 'image/webp', width: u16le(b, 26) & 0x3fff, height: u16le(b, 28) & 0x3fff };
  if (kind === 'VP8L') {
    const bits = b.readUInt32LE(21);
    return { mimeType: 'image/webp', width: (bits & 0x3fff) + 1, height: ((bits >>> 14) & 0x3fff) + 1 };
  }
  if (kind === 'VP8X') return { mimeType: 'image/webp', width: u24le(b, 24) + 1, height: u24le(b, 27) + 1 };
  return null;
}

/** Tipo y medidas reales de la imagen, o `null` si no es un PNG/JPEG/GIF/WebP válido y de tamaño razonable. */
export function sniffImage(buffer: Buffer): ImageInfo | null {
  let info: ImageInfo | null = null;
  try { info = png(buffer) ?? jpeg(buffer) ?? gif(buffer) ?? webp(buffer); } catch { return null; }
  if (!info) return null;
  const { width, height } = info;
  if (!(width > 0 && height > 0)) return null;
  if (width > IMAGE_LIMITS.maxSide || height > IMAGE_LIMITS.maxSide || width * height > IMAGE_LIMITS.maxPixels) return null;
  return info;
}

/** Nombre mostrable: sin rutas, sin caracteres de control y de largo acotado. */
export function safeImageName(raw: string | undefined, mime: ImageMime): string {
  const ext = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif', 'image/webp': 'webp' }[mime];
  const base = (raw ?? '').split(/[\\/]/).pop()!.replace(/[\u0000-\u001f\u007f<>:"|?*]/g, '').trim().slice(0, 100);
  return base || `imagen.${ext}`;
}
