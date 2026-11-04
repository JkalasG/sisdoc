import { IMAGE_LIMITS, safeImageName, sniffImage } from './image';
import { canEditMessage, deliveryStatus, EDIT_POLICY } from './receipt';

const png = (w: number, h: number) => {
  const b = Buffer.alloc(33);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(b, 0);
  b.writeUInt32BE(13, 8); b.write('IHDR', 12, 'latin1'); b.writeUInt32BE(w, 16); b.writeUInt32BE(h, 20);
  return b;
};
const gif = (w: number, h: number) => { const b = Buffer.alloc(16); b.write('GIF89a', 0, 'latin1'); b.writeUInt16LE(w, 6); b.writeUInt16LE(h, 8); return b; };
const jpeg = (w: number, h: number) => {
  const b = Buffer.alloc(30);
  Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x02]).copy(b, 0); // SOI + APP0 vacío
  Buffer.from([0xff, 0xc0, 0x00, 0x11, 0x08]).copy(b, 6); b.writeUInt16BE(h, 11); b.writeUInt16BE(w, 13);
  return b;
};
const webpX = (w: number, h: number) => {
  const b = Buffer.alloc(32);
  b.write('RIFF', 0, 'latin1'); b.write('WEBP', 8, 'latin1'); b.write('VP8X', 12, 'latin1');
  b.writeUIntLE(w - 1, 24, 3); b.writeUIntLE(h - 1, 27, 3);
  return b;
};

describe('Imágenes del chat: se reconocen por su contenido', () => {
  it.each([
    ['PNG', png(640, 480), 'image/png', 640, 480],
    ['JPEG', jpeg(800, 600), 'image/jpeg', 800, 600],
    ['GIF', gif(120, 90), 'image/gif', 120, 90],
    ['WebP', webpX(1024, 768), 'image/webp', 1024, 768],
  ])('%s: tipo y medidas reales', (_n, buf, mimeType, width, height) => {
    expect(sniffImage(buf)).toEqual({ mimeType, width, height });
  });

  it('rechaza lo que no es una imagen aunque se disfrace (SVG, HTML, texto, ejecutables, vacío)', () => {
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"></svg>');
    const html = Buffer.from('<html><script>alert(1)</script></html>');
    const exe = Buffer.concat([Buffer.from('MZ'), Buffer.alloc(100)]);
    for (const b of [svg, html, exe, Buffer.alloc(0), Buffer.from('GIF89'), Buffer.from('hola')]) expect(sniffImage(b)).toBeNull();
  });

  it('rechaza medidas imposibles o desproporcionadas (bombas de descompresión)', () => {
    expect(sniffImage(png(0, 10))).toBeNull();
    expect(sniffImage(png(IMAGE_LIMITS.maxSide + 1, 10))).toBeNull();
    expect(sniffImage(png(7000, 7000))).toBeNull(); // 49 MP > 40 MP
    expect(sniffImage(png(5000, 5000))).not.toBeNull(); // 25 MP
  });

  it('un archivo cortado a la mitad no rompe el lector', () => {
    expect(sniffImage(png(10, 10).subarray(0, 18))).toBeNull();
    expect(sniffImage(jpeg(10, 10).subarray(0, 9))).toBeNull();
  });

  it('el nombre mostrable no lleva rutas ni caracteres de control, y tiene respaldo', () => {
    expect(safeImageName('..\\..\\etc/passwd.png', 'image/png')).toBe('passwd.png');
    expect(safeImageName('fo\u0000to<1>.jpg', 'image/jpeg')).toBe('foto1.jpg');
    expect(safeImageName(undefined, 'image/webp')).toBe('imagen.webp');
    expect(safeImageName('x'.repeat(500) + '.png', 'image/png').length).toBeLessThanOrEqual(100);
  });
});

describe('Estado de entrega (lo que ve quien envía)', () => {
  const t = new Date('2026-03-02T10:00:00Z');
  const r = (d: boolean, l: boolean) => ({ deliveredAt: d ? t : null, readAt: l ? t : null });

  it('ENVIADO sin destinatarios o mientras a alguien no le haya llegado', () => {
    expect(deliveryStatus([])).toBe('SENT');
    expect(deliveryStatus([r(false, false)])).toBe('SENT');
    expect(deliveryStatus([r(true, false), r(false, false)])).toBe('SENT');
  });

  it('ENTREGADO cuando llegó a todos; LEÍDO solo cuando lo leyeron todos', () => {
    expect(deliveryStatus([r(true, false), r(true, false)])).toBe('DELIVERED');
    expect(deliveryStatus([r(true, true), r(true, false)])).toBe('DELIVERED');
    expect(deliveryStatus([r(true, true), r(true, true)])).toBe('READ');
  });

  it('leído implica entregado aunque falte la marca de entrega', () => {
    expect(deliveryStatus([r(false, true)])).toBe('READ');
  });
});

describe('Edición: solo los últimos 3 mensajes propios', () => {
  const recent = ['m5', 'm4', 'm3', 'm2', 'm1']; // del más nuevo al más viejo
  it('permite los 3 más recientes y niega el resto', () => {
    expect(EDIT_POLICY.lastMessages).toBe(3);
    for (const id of ['m5', 'm4', 'm3']) expect(canEditMessage(id, recent)).toBe(true);
    for (const id of ['m2', 'm1', 'ajeno']) expect(canEditMessage(id, recent)).toBe(false);
  });
  it('aunque la lista traiga de más, solo cuentan 3', () => {
    expect(canEditMessage('m2', ['m5', 'm4', 'm3', 'm2'])).toBe(false);
  });
});
