/**
 * Datos de demostración para la MENSAJERÍA: usuarios, chats directos, grupos, mensajes de varios días,
 * documentos PDF reales adjuntos (con sus permisos de descarga) y mensajes sin leer.
 *
 * Uso:  npm run seed:chat
 * Se puede repetir las veces que quieras: reemplaza SOLO las conversaciones de demostración (ids fijos) y vuelve a
 * fechar los mensajes respecto de "ahora", así siempre se ve "hoy", "ayer", etc. No toca tus otras conversaciones.
 */
import { createHash, randomUUID } from 'crypto';
import { mkdir, writeFile } from 'fs/promises';
import { dirname, join } from 'path';
import { PrismaClient } from '@prisma/client';
import { gradientPng, Rgb } from './png';
import * as argon2 from 'argon2';

const ARGON_OPTS = { type: argon2.argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1 } as const;

/** Mismas credenciales que prisma/seed.ts para ana, luis y admin; el resto comparte una clave de demostración. */
export const DEMO_PASSWORD = 'Demo#Iris2026';
export const DEMO_USERS = [
  { key: 'ana', email: 'ana@empresa.com', name: 'Ana Quispe', password: 'Segura#2026A' },
  { key: 'luis', email: 'luis@empresa.com', name: 'Luis Rojas', password: 'Segura#2026L' },
  { key: 'carlos', email: 'admin@empresa.com', name: 'Carlos Mendoza (Admin)', password: 'Admin#2026S', roles: ['ADMIN'] },
  { key: 'marta', email: 'marta@empresa.com', name: 'Marta Rojas', password: DEMO_PASSWORD },
  { key: 'jorge', email: 'jorge@empresa.com', name: 'Jorge Vargas', password: DEMO_PASSWORD },
  { key: 'carla', email: 'carla@empresa.com', name: 'Carla Soto', password: DEMO_PASSWORD },
  { key: 'diego', email: 'diego@empresa.com', name: 'Diego Pérez', password: DEMO_PASSWORD },
  { key: 'elena', email: 'elena@empresa.com', name: 'Elena Torres', password: DEMO_PASSWORD, roles: ['AUDITOR'] },
  { key: 'pablo', email: 'pablo@empresa.com', name: 'Pablo Rivas', password: DEMO_PASSWORD },
] as const;
type Who = (typeof DEMO_USERS)[number]['key'];

// ---------------------------------------------------------------- documentos adjuntos
const DEMO_DOCS = {
  compras: { codigo: 'DEMO-COMPRAS-001', nombre: 'Manual de compras 2026', archivo: 'manual-de-compras-2026.pdf', owner: 'luis' as Who, texto: ['Manual de compras 2026', 'Procedimiento de solicitud, cotización y aprobación.', 'Documento de demostración de Iris.'] },
  cierre: { codigo: 'DEMO-CONTA-002', nombre: 'Cierre contable de octubre', archivo: 'cierre-contable-octubre.pdf', owner: 'marta' as Who, texto: ['Cierre contable de octubre', 'Conciliaciones bancarias y provisiones.', 'Documento de demostración de Iris.'] },
  auditoria: { codigo: 'DEMO-AUD-003', nombre: 'Plan de auditoría 2026', archivo: 'plan-de-auditoria-2026.pdf', owner: 'elena' as Who, texto: ['Plan de auditoría interna 2026', 'Cronograma por área y alcance.', 'Documento de demostración de Iris.'] },
  proveedores: { codigo: 'DEMO-PROV-004', nombre: 'Lista de proveedores homologados', archivo: 'proveedores-homologados.pdf', owner: 'pablo' as Who, texto: ['Proveedores homologados', 'Criterios de evaluación y vigencia.', 'Documento de demostración de Iris.'] },
};
type DocKey = keyof typeof DEMO_DOCS;

/** PDF mínimo pero válido (con tabla xref), para que se pueda descargar y abrir de verdad. */
function pdfBytes(lines: string[]): Buffer {
  const esc = (s: string) => s.replace(/[\\()]/g, '\\$&').replace(/[^\x20-\x7e]/g, (c) => ({ á: 'a', é: 'e', í: 'i', ó: 'o', ú: 'u', ñ: 'n', Á: 'A', É: 'E', Í: 'I', Ó: 'O', Ú: 'U', Ñ: 'N' } as Record<string, string>)[c] ?? '');
  const text = lines.map((l, i) => `BT /F1 ${i === 0 ? 20 : 12} Tf 72 ${720 - i * 28} Td (${esc(l)}) Tj ET`).join('\n');
  const objs = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${Buffer.byteLength(text)} >>\nstream\n${text}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  let out = '%PDF-1.4\n';
  const offsets: number[] = [];
  objs.forEach((o, i) => { offsets.push(Buffer.byteLength(out)); out += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const xref = Buffer.byteLength(out);
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}`;
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, 'latin1');
}

// ---------------------------------------------------------------- conversaciones
/** Imágenes de demostración (PNG reales generados en código). */
const DEMO_IMAGES = {
  sala: { nombre: 'sala-de-reuniones.png', from: [37, 99, 235], to: [16, 185, 129], w: 640, h: 400 },
  grafico: { nombre: 'grafico-gastos-octubre.png', from: [245, 158, 11], to: [220, 38, 38], w: 600, h: 360 },
  factura: { nombre: 'factura-sucursal-norte.png', from: [99, 102, 241], to: [236, 72, 153], w: 480, h: 640 },
} as const satisfies Record<string, { nombre: string; from: Rgb; to: Rgb; w: number; h: number }>;
type ImgKey = keyof typeof DEMO_IMAGES;

type Seen = 'read' | 'delivered' | 'none';
interface Msg {
  by: Who; ago: string; text?: string; doc?: DocKey;
  key?: string;                       // para que otro mensaje pueda responderle
  replyTo?: string;                   // key del mensaje al que responde
  imgs?: ImgKey[];
  edited?: { was: string; ago: string }; // `text` es el texto actual; `was`, el anterior
  /** Estado de entrega por persona. Si no se indica: leído salvo lo «sin leer» configurado en la conversación. */
  seen?: Partial<Record<Who, Seen>>;
}
interface Conv { id: string; type: 'DIRECT' | 'GROUP'; name?: string; members: Who[]; unread?: Partial<Record<Who, number>>; messages: Msg[] }

/** "2d 4h 10m" → minutos. */
const mins = (ago: string) => [...ago.matchAll(/(\d+)\s*([dhm])/g)].reduce((t, [, n, u]) => t + Number(n) * ({ d: 1440, h: 60, m: 1 } as Record<string, number>)[u], 0);

export const DEMO_CONVERSATIONS: Conv[] = [
  {
    id: '00000000-0000-4000-8000-00000000c001', type: 'DIRECT', members: ['ana', 'luis'], unread: { ana: 2 },
    messages: [
      { by: 'luis', ago: '3d 5h', text: 'Hola Ana, ¿pudiste revisar la solicitud de compra de los monitores?' },
      { by: 'ana', ago: '3d 4h 40m', text: 'Hola Luis, sí. Falta la tercera cotización para poder aprobarla.' },
      { by: 'luis', ago: '3d 4h 20m', text: 'Claro, se la pido hoy mismo a Pablo.' },
      { by: 'ana', ago: '3d 4h', text: 'Perfecto 👍' },
      { by: 'luis', ago: '2d 2h', text: 'Te comparto el manual de compras actualizado, tiene el nuevo flujo de aprobación.', doc: 'compras' },
      { by: 'ana', ago: '2d 1h 30m', text: 'Gracias, lo reviso esta tarde.' },
      { by: 'ana', ago: '1d 22h', text: 'Ya lo leí. En el punto 4.2 hablan de tres cotizaciones mínimas a partir de 5.000 Bs. ¿Es así?' },
      { by: 'luis', ago: '1d 21h', text: 'Exacto, desde este mes. Antes eran dos.' },
      { by: 'ana', ago: '1d 20h', text: 'Entendido. Entonces la compra de monitores entra en ese caso.' },
      { by: 'luis', ago: '1d 3h', text: 'Ya llegó la tercera cotización. La subo hoy a la carpeta de la solicitud.' },
      { by: 'luis', ago: '2h 15m', text: 'Ana, subí las cotizaciones. ¿Puedes darme el visto bueno antes de las 4?' },
      { by: 'luis', ago: '40m', text: 'Si tienes dudas me avisas, estoy en la oficina todo el día.' },
    ],
  },
  {
    id: '00000000-0000-4000-8000-00000000c002', type: 'DIRECT', members: ['ana', 'marta'], unread: { ana: 3 },
    messages: [
      { by: 'ana', ago: '1d 6h', text: 'Marta, ¿ya tienes el cierre de octubre?' },
      { by: 'marta', ago: '1d 5h 30m', text: 'Casi. Me faltan las conciliaciones del banco, mañana te lo paso.' },
      { by: 'marta', ago: '5h', text: 'Buenos días Ana, te comparto el cierre contable de octubre.', doc: 'cierre' },
      { by: 'marta', ago: '4h 50m', text: 'Las provisiones están en la hoja 3. Cualquier diferencia me avisas.' },
      { by: 'marta', ago: '1h 10m', text: '¿Alcanzaste a mirarlo? Lo necesito firmado hoy para enviarlo a gerencia.' },
    ],
  },
  {
    id: '00000000-0000-4000-8000-00000000c003', type: 'DIRECT', members: ['ana', 'carlos'],
    messages: [
      { by: 'carlos', ago: '6d 3h', text: 'Ana, te creé el acceso al módulo de auditoría. Revisa que te funcione.' },
      { by: 'ana', ago: '6d 2h', text: 'Ya entré, todo bien. Gracias Carlos.' },
      { by: 'carlos', ago: '6d 1h', text: 'De nada. Recuerda cambiar la contraseña temporal.' },
      { by: 'ana', ago: '6d', text: 'Listo, ya la cambié.' },
    ],
  },
  {
    id: '00000000-0000-4000-8000-00000000c004', type: 'DIRECT', members: ['luis', 'pablo'],
    messages: [
      { by: 'luis', ago: '2d 6h', text: 'Pablo, necesito la lista de proveedores homologados vigente.' },
      { by: 'pablo', ago: '2d 5h', text: 'Te la envío ahora.', doc: 'proveedores' },
      { by: 'luis', ago: '2d 4h', text: 'Recibida, gracias.' },
    ],
  },
  {
    id: '00000000-0000-4000-8000-00000000c005', type: 'GROUP', name: 'Contabilidad', members: ['ana', 'luis', 'marta', 'carla', 'diego'], unread: { ana: 5, luis: 1 },
    messages: [
      { by: 'marta', ago: '6d 4h', text: 'Equipo, recuerden que el cierre de octubre es el viernes.' },
      { by: 'carla', ago: '6d 3h', text: 'Yo ya tengo las cuentas por pagar al día.' },
      { by: 'diego', ago: '6d 2h', text: 'Las cuentas por cobrar me faltan tres facturas por conciliar.' },
      { by: 'ana', ago: '6d 1h', text: '¿Cuáles? Te ayudo a revisarlas.' },
      { by: 'diego', ago: '6d', text: 'Las de la sucursal norte. Te las paso por aquí.' },
      { by: 'marta', ago: '5d 3h', text: 'Buen trabajo equipo. Vamos bien de tiempo.' },
      { by: 'carla', ago: '4d 6h', key: 'nota', text: '¿Alguien sabe cómo registrar la nota de crédito del proveedor de papelería?' },
      { by: 'luis', ago: '4d 5h', replyTo: 'nota', text: 'Va contra la cuenta de gastos de oficina, con el mismo centro de costo de la factura original.' },
      { by: 'carla', ago: '4d 4h', text: 'Gracias Luis 🙌' },
      { by: 'marta', ago: '3d 2h', text: 'Les dejo la plantilla de conciliación bancaria que vamos a usar desde este mes.' },
      { by: 'diego', ago: '3d 1h', text: 'Se ve más ordenada que la anterior.' },
      { by: 'ana', ago: '2d 5h', key: 'vac', text: 'Una consulta: ¿las provisiones de vacaciones van en este cierre?', edited: { was: 'Una consulta: ¿las provisiones van en este cierre?', ago: '2d 4h 55m' } },
      { by: 'marta', ago: '2d 4h', replyTo: 'vac', text: 'Sí, hasta el 31 de octubre.' },
      { by: 'carla', ago: '1d 7h', text: 'Ya subí los extractos de los tres bancos a la carpeta compartida.' },
      { by: 'diego', ago: '1d 3h', text: 'Les comparto la factura que genera la diferencia:', imgs: ['factura'] },
      { by: 'diego', ago: '1d 2h', text: 'Cuentas por cobrar cuadradas. Solo queda la diferencia de 120 Bs. de la sucursal norte.' },
      { by: 'marta', ago: '5h 5m', text: 'Compañeros, el cierre contable de octubre ya está listo para revisión.', doc: 'cierre' },
      { by: 'carla', ago: '3h', text: 'Lo reviso después del almuerzo.' },
      { by: 'diego', ago: '2h 30m', text: 'Yo encontré un error en la hoja de provisiones, ya se lo comenté a Marta.' },
      { by: 'marta', ago: '1h 30m', text: 'Así quedó el gasto por rubro de octubre:', imgs: ['grafico'] },
      { by: 'marta', ago: '1h', text: 'Corregido. Gracias Diego, buena observación.' },
      { by: 'marta', ago: '25m', text: 'Si nadie tiene observaciones, lo envío a gerencia a las 4 p. m.' },
    ],
  },
  {
    id: '00000000-0000-4000-8000-00000000c006', type: 'GROUP', name: 'Auditoría interna 2026', members: ['ana', 'elena', 'carlos', 'jorge'], unread: { carlos: 1, jorge: 1 },
    messages: [
      { by: 'elena', ago: '5d 6h', text: 'Buenas. Comparto el plan de auditoría 2026 para comentarios.', doc: 'auditoria' },
      { by: 'carlos', ago: '5d 4h', text: 'Lo revisé. Propongo adelantar la auditoría de sistemas a marzo.' },
      { by: 'elena', ago: '5d 3h', text: 'Tiene sentido, lo muevo.' },
      { by: 'jorge', ago: '5d 1h', text: 'Para logística necesito que sea después de la temporada alta.' },
      { by: 'elena', ago: '4d 22h', text: 'Entonces logística queda en junio. ¿Les parece?' },
      { by: 'jorge', ago: '4d 21h', text: 'Perfecto.' },
      { by: 'ana', ago: '4d 20h', text: 'Contabilidad sin observaciones por mi parte.' },
      { by: 'carlos', ago: '4d 19h', text: 'Quedamos entonces. Elena, publícalo como vigente.' },
      { by: 'ana', ago: '20m', text: 'Les adjunto en un rato mis comentarios al plan, ya casi los termino.', seen: { elena: 'read', carlos: 'delivered', jorge: 'none' } },
    ],
  },
  {
    id: '00000000-0000-4000-8000-00000000c007', type: 'GROUP', name: 'Compras y proveedores', members: ['luis', 'ana', 'pablo', 'jorge'], unread: { ana: 1 },
    messages: [
      { by: 'pablo', ago: '2d 7h', text: 'Actualicé la lista de proveedores homologados, dos salieron por vencimiento de documentos.', doc: 'proveedores' },
      { by: 'luis', ago: '2d 6h', text: '¿Cuáles salieron?' },
      { by: 'pablo', ago: '2d 5h 30m', text: 'Distribuidora Andina y Papelera del Sur. Ya les avisé para que renueven.' },
      { by: 'jorge', ago: '2d 4h', text: 'Para logística necesito un proveedor alterno de embalajes.' },
      { by: 'pablo', ago: '1d 23h', text: 'Te paso dos candidatos mañana.' },
      { by: 'pablo', ago: '3h 20m', text: 'Jorge, ya tengo los dos candidatos de embalajes con sus cotizaciones.' },
    ],
  },
  {
    id: '00000000-0000-4000-8000-00000000c008', type: 'GROUP', name: 'Avisos generales', members: ['ana', 'luis', 'carlos', 'marta', 'jorge', 'carla', 'diego', 'elena', 'pablo'], unread: { ana: 1 },
    messages: [
      { by: 'carlos', ago: '9d', text: 'Bienvenidos a Iris. Aquí publicaremos los avisos importantes de la empresa.' },
      { by: 'carlos', ago: '4d 3h', text: 'Recordatorio: los documentos nuevos deben registrarse con su código antes de compartirse.' },
      { by: 'carlos', ago: '5d', text: 'Así quedó la nueva sala de reuniones del segundo piso. Ya se puede reservar.', imgs: ['sala'] },
      { by: 'carlos', ago: '1d 4h', text: 'El sábado habrá mantenimiento del servidor de 22:00 a 23:00. El sistema no estará disponible.' },
      { by: 'carlos', ago: '50m', text: 'Mantenimiento reprogramado para el domingo a la misma hora. Disculpen la molestia.' },
    ],
  },
];

// ---------------------------------------------------------------- ejecución
export interface SeedChatResult { users: number; conversations: number; messages: number; attachments: number; documents: number; images: number; receipts: number; edits: number; replies: number }

export async function seedChat(
  prisma: PrismaClient,
  opts: { now?: Date; storageDir?: string; log?: (s: string) => void } = {},
): Promise<SeedChatResult> {
  const now = opts.now ?? new Date();
  const storageDir = opts.storageDir ?? process.env.STORAGE_DIR ?? './storage';
  const log = opts.log ?? (() => undefined);
  const at = (ago: string) => new Date(now.getTime() - mins(ago) * 60_000);

  // 1) usuarios (los que ya existen se respetan: no se les cambia la contraseña)
  const ids = {} as Record<Who, string>;
  const demoHash = await argon2.hash(DEMO_PASSWORD, ARGON_OPTS);
  for (const u of DEMO_USERS) {
    let row = await prisma.user.findUnique({ where: { email: u.email } });
    if (!row) {
      const passwordHash = u.password === DEMO_PASSWORD ? demoHash : await argon2.hash(u.password, ARGON_OPTS);
      row = await prisma.user.create({
        data: { email: u.email, displayName: u.name, passwordHash, mustChangePassword: false, roles: 'roles' in u ? [...u.roles] : ['USUARIO'] },
      });
      await prisma.passwordHistory.create({ data: { userId: row.id, passwordHash } });
    } else if (row.status !== 'ACTIVE') {
      row = await prisma.user.update({ where: { id: row.id }, data: { status: 'ACTIVE' } });
    }
    ids[u.key] = row.id;
  }

  // 2) documentos adjuntos (archivo PDF real en el almacenamiento + versión + registro)
  const docs = {} as Record<DocKey, { documentId: string; versionId: string }>;
  for (const [key, d] of Object.entries(DEMO_DOCS) as Array<[DocKey, (typeof DEMO_DOCS)[DocKey]]>) {
    const existing = await prisma.document.findUnique({ where: { codigo: d.codigo }, include: { versions: true } });
    if (existing?.versionVigenteId) { docs[key] = { documentId: existing.id, versionId: existing.versionVigenteId }; continue; }
    const body = pdfBytes([...d.texto]);
    const documentId = randomUUID(); const versionId = randomUUID();
    const storageKey = `documents/${documentId}/${versionId}`;
    const path = join(storageDir, storageKey);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, body);
    const created = at('10d');
    await prisma.document.create({
      data: {
        id: documentId, codigo: d.codigo, nombreDocumento: d.nombre, estado: 'APROBADO', gestion: created.getUTCFullYear(),
        fechaCreacion: created, usuarioCreadorId: ids[d.owner], fechaModificacion: created, usuarioModificadorId: ids[d.owner],
        fechaActualizacion: created, usuarioActualizadorId: ids[d.owner], revisorId: ids.carlos,
      },
    });
    await prisma.documentVersion.create({
      data: {
        id: versionId, documentId, versionNumber: 1, storageKey, fileName: d.archivo, mimeType: 'application/pdf',
        sizeBytes: BigInt(body.length), checksumSha256: createHash('sha256').update(body).digest('hex'), uploadedById: ids[d.owner], createdAt: created,
      },
    });
    await prisma.document.update({
      where: { id: documentId },
      data: { versionVigenteId: versionId, urlPdf: `/documents/${documentId}/download?versionId=${versionId}` },
    });
    docs[key] = { documentId, versionId };
  }

  // 3) conversaciones: se reemplazan solo las de demostración
  const demoIds = DEMO_CONVERSATIONS.map((c) => c.id);
  await prisma.messageAttachment.deleteMany({ where: { message: { conversationId: { in: demoIds } } } });
  await prisma.message.deleteMany({ where: { conversationId: { in: demoIds } } });

  let messages = 0; let attachments = 0; let images = 0; let receipts = 0; let edits = 0; let replies = 0;
  for (const c of DEMO_CONVERSATIONS) {
    const directKey = c.type === 'DIRECT' ? c.members.map((m) => ids[m]).sort().join(':') : null;
    // Un directo de demostración no debe chocar con uno real ya existente entre las mismas personas.
    const clash = directKey ? await prisma.conversation.findUnique({ where: { directKey } }) : null;
    const convId = clash ? clash.id : c.id;
    if (clash && clash.id !== c.id) { await prisma.message.deleteMany({ where: { conversationId: clash.id } }); }
    await prisma.conversation.upsert({
      where: { id: convId }, update: { name: c.name ?? null, directKey },
      create: { id: convId, type: c.type, name: c.name, directKey, createdAt: at(c.messages[0].ago) },
    });
    // Quitar integrantes que ya no deberían estar y asegurar los que sí.
    await prisma.conversationMember.deleteMany({ where: { conversationId: convId, userId: { notIn: c.members.map((m) => ids[m]) } } });

    const created: Array<{ id: string; by: Who; createdAt: Date; msg: Msg }> = [];
    const byKey = new Map<string, string>();
    for (const m of c.messages) {
      const createdAt = at(m.ago);
      const replyToId = m.replyTo ? byKey.get(m.replyTo) : undefined;
      if (m.replyTo && !replyToId) throw new Error(`Respuesta a un mensaje inexistente: ${m.replyTo}`);
      const row = await prisma.message.create({
        data: {
          conversationId: convId, authorId: ids[m.by], content: m.text ?? null, createdAt, replyToId: replyToId ?? null,
          editedAt: m.edited ? at(m.edited.ago) : null,
          ...(m.doc ? { attachments: { create: [{ documentId: docs[m.doc].documentId, versionId: docs[m.doc].versionId }] } } : {}),
        },
      });
      created.push({ id: row.id, by: m.by, createdAt, msg: m });
      if (m.key) byKey.set(m.key, row.id);
      messages++;
      if (replyToId) replies++;
      if (m.edited) {
        await prisma.messageEdit.create({ data: { messageId: row.id, editorId: ids[m.by], previousContent: m.edited.was, editedAt: at(m.edited.ago) } });
        edits++;
      }
      for (const [n, key] of (m.imgs ?? []).entries()) {
        const d = DEMO_IMAGES[key];
        const body = gradientPng(d.w, d.h, d.from, d.to);
        const storageKey = `chat-images/demo-${convId}-${created.length}-${n}`; // fijo: repetir el seed sobrescribe, no acumula
        const path = join(storageDir, storageKey);
        await mkdir(dirname(path), { recursive: true });
        await writeFile(path, body);
        await prisma.messageImage.create({
          data: { messageId: row.id, conversationId: convId, uploaderId: ids[m.by], storageKey, fileName: d.nombre, mimeType: 'image/png', sizeBytes: body.length, width: d.w, height: d.h, createdAt },
        });
        images++;
      }
      if (m.doc) {
        attachments++;
        // Igual que al compartir por el chat: los demás miembros reciben permiso de descarga y queda constancia.
        for (const other of c.members.filter((x) => x !== m.by)) {
          if (other === DEMO_DOCS[m.doc].owner) continue; // el dueño ya tiene acceso
          const share = await prisma.documentShare.findUnique({ where: { documentId_userId: { documentId: docs[m.doc].documentId, userId: ids[other] } } });
          if (share) continue;
          await prisma.documentShare.create({ data: { documentId: docs[m.doc].documentId, userId: ids[other], permission: 'DESCARGAR', sharedById: ids[m.by], createdAt } });
          await prisma.documentAccessLog.create({
            data: { documentId: docs[m.doc].documentId, versionId: docs[m.doc].versionId, userId: ids[m.by], action: 'COMPARTIR', channel: `chat:${convId}`, metadata: { recipientId: ids[other], permission: 'DESCARGAR' }, createdAt },
          });
        }
      }
    }

    // Lo "sin leer" de cada persona: los últimos N mensajes ajenos.
    for (const member of c.members) {
      const others = created.filter((m) => m.by !== member);
      const n = c.unread?.[member] ?? 0;
      const last = created.at(-1)!.createdAt;
      const lastReadAt = n > 0 && others.length >= n ? new Date(others[others.length - n].createdAt.getTime() - 1000) : new Date(last.getTime() + 1000);
      await prisma.conversationMember.upsert({
        where: { conversationId_userId: { conversationId: convId, userId: ids[member] } },
        update: { lastReadAt }, create: { conversationId: convId, userId: ids[member], lastReadAt },
      });
    }
    // Acuses con fecha y hora: la entrega llega segundos después del envío; la lectura, según lo «sin leer» de cada persona.
    const readUpTo = new Map<Who, number>();
    for (const member of c.members) {
      const row = await prisma.conversationMember.findUniqueOrThrow({ where: { conversationId_userId: { conversationId: convId, userId: ids[member] } } });
      readUpTo.set(member, row.lastReadAt?.getTime() ?? 0);
    }
    for (const [i, m] of created.entries()) {
      for (const member of c.members.filter((x) => x !== m.by)) {
        const state: Seen = m.msg.seen?.[member] ?? (m.createdAt.getTime() <= (readUpTo.get(member) ?? 0) ? 'read' : 'delivered');
        const deliveredAt = new Date(Math.min(m.createdAt.getTime() + (2 + (i * 7) % 25) * 1000, now.getTime()));
        const readAt = new Date(Math.min(deliveredAt.getTime() + (8 + (i * 37) % 280) * 1000, now.getTime()));
        await prisma.messageReceipt.create({
          data: { messageId: m.id, userId: ids[member], deliveredAt: state === 'none' ? null : deliveredAt, readAt: state === 'read' ? readAt : null },
        });
        receipts++;
      }
    }
    log(`  ${c.type === 'GROUP' ? 'Grupo' : 'Directo'}: ${c.name ?? c.members.join(' ↔ ')} (${c.messages.length} mensajes)`);
  }

  return { users: DEMO_USERS.length, conversations: DEMO_CONVERSATIONS.length, messages, attachments, documents: Object.keys(DEMO_DOCS).length, images, receipts, edits, replies };
}

async function main() {
  const prisma = new PrismaClient();
  try {
    console.log('Cargando datos de demostración de la mensajería…');
    const r = await seedChat(prisma, { log: console.log });
    console.log(`\nListo: ${r.conversations} conversaciones, ${r.messages} mensajes, ${r.attachments} adjuntos, ${r.images} imágenes, ${r.replies} respuestas, ${r.edits} ediciones, ${r.receipts} acuses, ${r.documents} documentos.`);
    console.log('\nPara verlo (pon VITE_USE_MOCKS=false en frontend/.env y reinicia el frontend), entra con:');
    for (const u of DEMO_USERS) console.log(`  ${u.email.padEnd(20)} ${u.password}`);
    console.log('\nCada usuario nuevo en un navegador necesita aprobar el dispositivo: npm run device:approve -- correo@empresa.com');
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) main().catch((e) => { console.error(e); process.exit(1); });
