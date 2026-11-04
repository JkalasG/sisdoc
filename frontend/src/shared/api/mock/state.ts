import type { AccessLogDTO, ConversationDTO, DocStatus, MessageDTO, ReviewDTO, UserLite, VersionDTO } from '../types';

export const MOCK_PASSWORD = 'Clave-Segura-2026';
export const MOCK_TEMP_PASSWORD = 'Temporal-Clave-2026';

export interface MockUser extends UserLite { password: string; mustChangePassword: boolean; roles?: string[] }
/** Registro maestro. `version`, `cambios`, `gestion`, `urlWord` y `urlPdf` se derivan al responder. */
export interface MockDoc {
  id: string; codigo: string; title: string; description?: string; status: DocStatus; ownerId: string;
  fechaCreacion: string;
  modificadoPor: string; modificadoEn: string;       // datos o estado
  actualizadoPor: string; actualizadoEn: string;     // archivo (nueva versión)
  revisorId?: string;
  versions: (VersionDTO & { content: string })[]; reviews: ReviewDTO[];
  shares: Record<string, 'VER' | 'DESCARGAR' | 'EDITAR'>;
}
export interface MockSession {
  userId: string; accessExpiresAt: number; lastActivityAt: number; absoluteExpiresAt: number;
}

export interface MockState {
  users: MockUser[];
  docs: MockDoc[];
  logs: Record<string, AccessLogDTO[]>;
  conversations: (ConversationDTO & { memberIds: string[] })[];
  messages: MessageDTO[];
  session: MockSession | null;
  // Interruptores del panel de demo
  scenario: {
    deviceKnown: boolean;          // false = este navegador es un dispositivo nuevo, pendiente de aprobación
    deviceBlocked: boolean;
    sessionLimit: boolean;         // el próximo login responde "ya tienes 3 sesiones"
    serverDown: boolean;           // simula backend caído
    captchaEnabled: boolean;       // true = el login exige captcha (como CAPTCHA_ENABLED=true en el backend)
    googleEnabled: boolean;        // true = aparece y funciona "Continuar con Google"
    passwordResetEnabled: boolean; // true = "¿Olvidaste tu contraseña?" disponible (como MAIL_DRIVER != off en el backend)
    googleAutoRegister: boolean;   // true = un correo desconocido se registra y queda pendiente de activación
  };
  failed: Record<string, { attempts: number; lockedUntil: number; level: number }>;
  clockOffsetMs: number;
  seq: number;
}

const STORAGE_KEY = 'sisdoc-mock-db-v3'; // subir la versión descarta datos guardados con una forma anterior
const ago = (min: number) => new Date(Date.now() - min * 60_000).toISOString();
const sum = (s: string) => {
  let h = 2166136261;
  const out: string[] = [];
  for (let i = 0; i < 8; i++) {
    for (const c of `${s}${i}`) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); }
    out.push((h >>> 0).toString(16).padStart(8, '0'));
  }
  return out.join('');
};
export const fakeChecksum = sum;

const ver = (docId: string, n: number, fileName: string, mime: string, size: number, by: UserLite, minAgo: number, note?: string) => ({
  id: `${docId}-v${n}`, versionNumber: n, fileName, mimeType: mime, sizeBytes: size, checksumSha256: sum(`${docId}${n}${size}`),
  changeNote: note, uploadedById: by.id, uploadedByName: by.name, createdAt: ago(minAgo),
  content: `Contenido simulado de "${fileName}" — versión ${n}.\nEste archivo es parte del modo demo.`,
});

export function initialState(): MockState {
  const ana: MockUser = { id: 'u-ana', name: 'Ana Quispe', email: 'ana@empresa.com', password: MOCK_PASSWORD, mustChangePassword: false };
  const luis: MockUser = { id: 'u-luis', name: 'Luis Mamani', email: 'luis@empresa.com', password: MOCK_PASSWORD, mustChangePassword: false };
  const marta: MockUser = { id: 'u-marta', name: 'Marta Rojas', email: 'marta@empresa.com', password: MOCK_PASSWORD, mustChangePassword: false };
  const jorge: MockUser = { id: 'u-jorge', name: 'Jorge Vargas', email: 'jorge@empresa.com', password: MOCK_PASSWORD, mustChangePassword: false };
  const admin: MockUser = { id: 'u-admin', name: 'Administrador', email: 'admin@empresa.com', password: MOCK_PASSWORD, mustChangePassword: false, roles: ['ADMIN'] };
  const nueva: MockUser = { id: 'u-nueva', name: 'Usuario Nuevo', email: 'nueva@empresa.com', password: MOCK_TEMP_PASSWORD, mustChangePassword: true };

  const pdf = 'application/pdf';
  const docx = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  const xlsx = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

  const docs: MockDoc[] = [
    {
      id: 'd-contrato', codigo: 'PR-LOG-001', title: 'Contrato de servicios 2026', description: 'Contrato marco con el proveedor de logística.',
      status: 'EN_REVISION', ownerId: ana.id, shares: { [luis.id]: 'DESCARGAR' },
      fechaCreacion: ago(60 * 24 * 3), modificadoPor: ana.id, modificadoEn: ago(30), actualizadoPor: ana.id, actualizadoEn: ago(35), revisorId: luis.id,
      versions: [
        ver('d-contrato', 1, 'contrato-servicios.docx', docx, 84_200, ana, 60 * 24 * 3, 'Versión inicial'),
        ver('d-contrato', 2, 'contrato-servicios.docx', docx, 86_950, ana, 60 * 5, 'Se corrigió la cláusula 4 (plazos de entrega)'),
        ver('d-contrato', 3, 'contrato-servicios.docx', docx, 87_300, ana, 35, 'Ajuste de montos según observación legal'),
      ],
      reviews: [{
        id: 'r-1', versionId: 'd-contrato-v3', versionNumber: 3, reviewerId: luis.id, reviewerName: luis.name,
        requestedByName: ana.name, decision: 'PENDIENTE', requestedAt: ago(30),
      }],
    },
    {
      id: 'd-presupuesto', codigo: 'FIN-PRE-002', title: 'Presupuesto trimestral Q2', description: 'Consolidado por departamento.',
      status: 'APROBADO', ownerId: ana.id, shares: { [marta.id]: 'DESCARGAR' },
      fechaCreacion: ago(60 * 24 * 6), modificadoPor: marta.id, modificadoEn: ago(60 * 26), actualizadoPor: ana.id, actualizadoEn: ago(60 * 24 * 2), revisorId: marta.id,
      versions: [
        ver('d-presupuesto', 1, 'presupuesto-q2.xlsx', xlsx, 212_400, ana, 60 * 24 * 6),
        ver('d-presupuesto', 2, 'presupuesto-q2.xlsx', xlsx, 215_000, ana, 60 * 24 * 2, 'Se agregó el rubro de capacitación'),
      ],
      reviews: [{
        id: 'r-2', versionId: 'd-presupuesto-v2', versionNumber: 2, reviewerId: marta.id, reviewerName: marta.name,
        requestedByName: ana.name, decision: 'APROBADO', comment: 'Conforme. Cuadra con el cierre contable.',
        requestedAt: ago(60 * 40), decidedAt: ago(60 * 26),
      }],
    },
    {
      id: 'd-manual', codigo: 'RH-MAN-003', title: 'Manual de inducción', status: 'BORRADOR', ownerId: ana.id, shares: {},
      fechaCreacion: ago(60 * 24 * 8), modificadoPor: ana.id, modificadoEn: ago(60 * 24 * 8), actualizadoPor: ana.id, actualizadoEn: ago(60 * 24 * 8),
      versions: [ver('d-manual', 1, 'manual-induccion.pdf', pdf, 1_480_000, ana, 60 * 24 * 8)], reviews: [],
    },
    {
      id: 'd-acta', codigo: 'ADM-ACT-004', title: 'Acta de reunión – Comité de compras', description: 'Compartida contigo por Marta.',
      status: 'APROBADO', ownerId: marta.id, shares: { [ana.id]: 'DESCARGAR' },
      fechaCreacion: ago(60 * 3), modificadoPor: marta.id, modificadoEn: ago(60 * 3), actualizadoPor: marta.id, actualizadoEn: ago(60 * 3), revisorId: marta.id,
      versions: [ver('d-acta', 1, 'acta-comite-compras.pdf', pdf, 320_500, marta, 60 * 3)], reviews: [],
    },
    {
      id: 'd-politica', codigo: 'RH-POL-005', title: 'Política de gastos de viaje', status: 'RECHAZADO', ownerId: jorge.id,
      shares: { [ana.id]: 'VER' },
      fechaCreacion: ago(60 * 24 * 4), modificadoPor: ana.id, modificadoEn: ago(60 * 24 * 2), actualizadoPor: jorge.id, actualizadoEn: ago(60 * 24 * 4), revisorId: ana.id,
      versions: [ver('d-politica', 1, 'politica-viajes.docx', docx, 64_000, jorge, 60 * 24 * 4)],
      reviews: [{
        id: 'r-3', versionId: 'd-politica-v1', versionNumber: 1, reviewerId: ana.id, reviewerName: ana.name,
        requestedByName: jorge.name, decision: 'RECHAZADO', comment: 'Faltan los topes por categoría de cargo.',
        requestedAt: ago(60 * 24 * 3), decidedAt: ago(60 * 24 * 2),
      }],
    },
  ];

  const log = (id: string, action: AccessLogDTO['action'], u: UserLite, min: number, extra: Partial<AccessLogDTO> = {}): AccessLogDTO => ({
    id: `${id}-${action}-${min}`, action, userId: u.id, userName: u.name, createdAt: ago(min), ip: '10.0.0.5', channel: 'archivos', ...extra,
  });
  const logs: Record<string, AccessLogDTO[]> = {
    'd-contrato': [
      log('c', 'REVISION_SOLICITADA', ana, 30, { versionNumber: 3, detail: `Revisor: ${luis.name}` }),
      log('c', 'DESCARGAR', luis, 22, { versionNumber: 3, ip: '200.87.14.22', channel: 'chat:c-luis' }),
      log('c', 'COMPARTIR', ana, 31, { versionNumber: 3, channel: 'chat:c-luis', detail: `Compartido con ${luis.name} (descarga)` }),
      log('c', 'NUEVA_VERSION', ana, 35, { versionNumber: 3 }),
      log('c', 'DESCARGAR', ana, 60 * 4, { versionNumber: 2 }),
      log('c', 'NUEVA_VERSION', ana, 60 * 5, { versionNumber: 2 }),
      log('c', 'SUBIR', ana, 60 * 24 * 3, { versionNumber: 1 }),
    ],
    'd-presupuesto': [
      log('p', 'REVISION_DECIDIDA', marta, 60 * 26, { versionNumber: 2, detail: 'Aprobado' }),
      log('p', 'DESCARGAR', marta, 60 * 27, { versionNumber: 2, ip: '190.129.3.8' }),
      log('p', 'REVISION_SOLICITADA', ana, 60 * 40, { versionNumber: 2, detail: `Revisor: ${marta.name}` }),
      log('p', 'NUEVA_VERSION', ana, 60 * 24 * 2, { versionNumber: 2 }),
      log('p', 'SUBIR', ana, 60 * 24 * 6, { versionNumber: 1 }),
    ],
    'd-manual': [log('m', 'SUBIR', ana, 60 * 24 * 8, { versionNumber: 1 })],
  };

  const att = (docId: string, v: number, fileName: string, mime: string, size: number) => ({
    documentId: docId, versionId: `${docId}-v${v}`, versionNumber: v, fileName, mimeType: mime, sizeBytes: size,
  });
  const conversations: MockState['conversations'] = [
    { id: 'c-luis', type: 'DIRECT', name: luis.name, members: [ana, luis].map(({ id, name, email }) => ({ id, name, email })), memberIds: [ana.id, luis.id], unread: 0, online: true, pinned: true },
    { id: 'c-conta', type: 'GROUP', name: 'Contabilidad', members: [ana, marta, jorge, luis].map(({ id, name, email }) => ({ id, name, email })), memberIds: [ana.id, marta.id, jorge.id, luis.id], unread: 2, pinned: true },
    { id: 'c-marta', type: 'DIRECT', name: marta.name, members: [ana, marta].map(({ id, name, email }) => ({ id, name, email })), memberIds: [ana.id, marta.id], unread: 1, online: false, lastSeen: ago(42) },
    { id: 'c-jorge', type: 'DIRECT', name: jorge.name, members: [ana, jorge].map(({ id, name, email }) => ({ id, name, email })), memberIds: [ana.id, jorge.id], unread: 0, online: false, lastSeen: ago(60 * 5) },
    { id: 'c-alfa', type: 'GROUP', name: 'Proyecto Alfa', members: [ana, luis, jorge].map(({ id, name, email }) => ({ id, name, email })), memberIds: [ana.id, luis.id, jorge.id], unread: 0, muted: true },
  ];
  const msg = (id: string, c: string, u: UserLite, text: string | undefined, min: number, attachments: MessageDTO['attachments'] = []): MessageDTO => ({
    id, conversationId: c, authorId: u.id, authorName: u.name, content: text, attachments, createdAt: ago(min),
  });
  const messages: MessageDTO[] = [
    // Historial largo (120 mensajes más antiguos) para ver la carga por páginas en el modo demostración.
    ...Array.from({ length: 120 }, (_, i) => msg(`h${i}`, 'c-alfa', [luis, jorge, ana][i % 3], `Mensaje antiguo n.º ${i + 1} del proyecto`, 60 * 31 + (120 - i) * 7)),
    msg('m1', 'c-luis', ana, 'Luis, te envío el contrato para tu revisión. Quedó la cláusula 4 corregida.', 32),
    msg('m2', 'c-luis', ana, undefined, 31, [att('d-contrato', 3, 'contrato-servicios.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 87_300)]),
    msg('m3', 'c-luis', luis, 'Recibido, lo reviso esta tarde.', 25),
    msg('m4', 'c-conta', marta, 'Recuerden cargar los comprobantes antes del viernes.', 180),
    msg('m5', 'c-conta', jorge, 'Ya subí el consolidado de gastos.', 150),
    msg('m6', 'c-conta', marta, undefined, 90, [att('d-acta', 1, 'acta-comite-compras.pdf', 'application/pdf', 320_500)]),
    msg('m7', 'c-marta', marta, 'Gracias por aprobar el presupuesto 🙌', 60 * 25),
    { ...msg('m8', 'c-marta', marta, undefined, 50), kind: 'voice', voiceSeconds: 23 },
    { ...msg('m9', 'c-marta', marta, 'Cuando puedas escúchalo y me dices', 49) },
    { ...msg('m10', 'c-conta', jorge, 'Así quedó la nueva sala de reuniones', 120), kind: 'image', imageSeed: 3 },
    { ...msg('m11', 'c-conta', marta, 'Se ve genial 👏', 110), replyToId: 'm10', replyTo: { id: 'm10', authorId: jorge.id, authorName: 'Jorge Vargas', text: 'Así quedó la nueva sala de reuniones', kind: 'IMAGE' as const } },
    msg('m12', 'c-jorge', jorge, 'Ana, ¿tienes el reporte de gastos de ayer?', 60 * 6),
    msg('m13', 'c-jorge', ana, 'Sí, te lo subo en un momento.', 60 * 6 - 5),
    msg('m14', 'c-alfa', luis, 'Reunión de arranque mañana 9:00', 60 * 30),
  ];

  // Mis mensajes llevan un acuse por destinatario con su fecha y hora (el servidor real hace lo mismo para quien envía).
  const sec = (iso: string, s: number) => new Date(new Date(iso).getTime() + s * 1000).toISOString();
  const unreadByThem = new Set(['m2']); // el único que alguien aún no leyó
  for (const m of messages.filter((x) => x.authorId === ana.id)) {
    const conv = conversations.find((c) => c.id === m.conversationId)!;
    m.receipts = conv.memberIds.filter((id) => id !== ana.id).map((id) => {
      const who = [luis, marta, jorge].find((u) => u.id === id)!;
      return { userId: id, userName: who.name, deliveredAt: sec(m.createdAt, 3), readAt: unreadByThem.has(m.id) ? null : sec(m.createdAt, 41) };
    });
  }

  return {
    users: [ana, luis, marta, jorge, nueva, admin], docs, logs, conversations, messages, session: null,
    scenario: { deviceKnown: true, deviceBlocked: false, sessionLimit: false, serverDown: false, captchaEnabled: false, googleEnabled: false, googleAutoRegister: true, passwordResetEnabled: true },
    failed: {}, clockOffsetMs: 0, seq: 100,
  };
}

export function loadState(): MockState {
  const fresh = initialState();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return fresh;
    const saved = JSON.parse(raw) as MockState;
    // Si el estado guardado es de una versión anterior (faltan usuarios o campos nuevos), se completa con los datos base
    // en lugar de dejar al usuario sin poder entrar.
    const known = new Set(saved.users?.map((u) => u.id));
    const missing = fresh.users.filter((u) => !known.has(u.id));
    return { ...fresh, ...saved, users: [...(saved.users ?? []), ...missing], scenario: { ...fresh.scenario, ...saved.scenario }, failed: {} };
  } catch { /* storage no disponible o corrupto: se usa el estado inicial */ }
  return fresh;
}
export function persist(state: MockState) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch { /* sin storage */ }
}
export function wipeStorage() {
  try { localStorage.removeItem(STORAGE_KEY); } catch { /* sin storage */ }
}
