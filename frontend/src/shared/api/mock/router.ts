// Backend SIMULADO. Responde como el real (mismos códigos, mismos mensajes y mismas reglas de sesión),
// pero todo en memoria del navegador. Solo se carga si VITE_USE_MOCKS=true.
import type { Transport, TransportResponse } from '../http';
import type {
  AccessLogDTO, ConversationDTO, CurrentUser, DocumentDetail, DocumentSummary, MessageDTO, MyPermission,
} from '../types';
import {
  fakeChecksum, initialState, loadState, MockDoc, MockState, MockUser, persist, wipeStorage,
} from './state';

const INACTIVITY = 30 * 60_000;
const ACCESS_TTL = 15 * 60_000;
const ABSOLUTE = 12 * 3_600_000;
const COMMON = new Set(['password1234', '123456789012', 'qwertyuiop12', 'changeme1234']);

let state: MockState = loadState();
type BusEvent = { type: 'message:new'; message: MessageDTO } | { type: 'typing'; conversationId: string; name: string; on: boolean };
const listeners = new Set<(e: BusEvent) => void>();

export const mockBus = {
  on(cb: (e: BusEvent) => void) {
    listeners.add(cb);
    return () => { listeners.delete(cb); };
  },
};

const now = () => Date.now() + state.clockOffsetMs;
const iso = (ms = now()) => new Date(ms).toISOString();
const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));
const nextId = (p: string) => `${p}-${++state.seq}`;
const save = () => persist(state);

const ok = (data?: unknown, status = 200): TransportResponse => ({ status, data });
const fail = (status: number, code: string, message: string): TransportResponse => ({ status, data: { code, message } });
const INVALID = () => fail(401, 'INVALID_CREDENTIALS', 'Credenciales inválidas o cuenta temporalmente bloqueada');
const UNAUTH = () => fail(401, 'UNAUTHENTICATED', 'Sesión no válida');
const NOT_FOUND = () => fail(404, 'NOT_FOUND', 'Documento no encontrado');

/** Controles que usa el panel de demostración. */
export const mockControls = {
  get state() { return state; },
  reset() { wipeStorage(); state = initialState(); save(); },
  set(patch: Partial<MockState['scenario']>) { state.scenario = { ...state.scenario, ...patch }; save(); },
  expireAccessToken() { if (state.session) { state.session.accessExpiresAt = now() - 1; save(); } },
  advanceTime(ms: number) { state.clockOffsetMs += ms; save(); },
  approveDevices() { state.scenario.deviceKnown = true; state.scenario.deviceBlocked = false; save(); },
  blockDevice() { state.scenario.deviceBlocked = true; if (state.session) state.session = null; save(); },
  endSession() { state.session = null; save(); },
};

// ---- sesión -----------------------------------------------------------------
function authenticate(): { user: MockUser } | TransportResponse {
  const s = state.session;
  if (!s) return UNAUTH();
  if (now() - s.lastActivityAt >= INACTIVITY || now() >= s.absoluteExpiresAt) { state.session = null; save(); return UNAUTH(); }
  if (state.scenario.deviceBlocked) { state.session = null; save(); return UNAUTH(); }
  if (now() >= s.accessExpiresAt) return UNAUTH(); // el cliente debe renovar con /auth/refresh
  const user = state.users.find((u) => u.id === s.userId);
  if (!user) return UNAUTH();
  s.lastActivityAt = now();
  save();
  return { user };
}
const isResponse = (x: unknown): x is TransportResponse => !!x && typeof (x as TransportResponse).status === 'number';

const toCurrent = (u: MockUser): CurrentUser => ({ id: u.id, email: u.email, displayName: u.name, mustChangePassword: u.mustChangePassword, roles: u.roles ?? ['USER'] });

function validatePassword(pw: string, email: string): string[] {
  const p: string[] = [];
  if (pw.length < 12) p.push('Debe tener al menos 12 caracteres');
  if (COMMON.has(pw.toLowerCase())) p.push('Es una contraseña demasiado común');
  const local = email.split('@')[0].toLowerCase();
  if (local.length >= 3 && pw.toLowerCase().includes(local)) p.push('No puede contener tu correo');
  return p;
}

// ---- documentos -------------------------------------------------------------
const permissionOf = (d: MockDoc, uid: string): MyPermission | null =>
  d.ownerId === uid ? 'PROPIETARIO' : d.shares[uid] ?? null;
const canDownload = (p: MyPermission | null) => p === 'PROPIETARIO' || p === 'EDITAR' || p === 'DESCARGAR';
const userName = (id: string) => state.users.find((u) => u.id === id)?.name ?? 'Desconocido';

const WORD = new Set(['application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/msword']);
const persona = (id: string) => ({ id, nombre: userName(id) });
/** Último archivo Word / PDF del documento (url_word / url_pdf). */
const urlDe = (d: MockDoc, kind: 'word' | 'pdf') => {
  const v = [...d.versions].reverse().find((x) => (kind === 'word' ? WORD.has(x.mimeType) : x.mimeType === 'application/pdf'));
  return v ? `/documents/${d.id}/download?versionId=${v.id}` : undefined;
};

function summary(d: MockDoc, uid: string): DocumentSummary {
  const { content: _c, ...current } = d.versions[d.versions.length - 1];
  return {
    id: d.id, codigo: d.codigo, nombreDocumento: d.title, descripcion: d.description, estado: d.status,
    gestion: Number(new Intl.DateTimeFormat('en-US', { timeZone: 'America/La_Paz', year: 'numeric' }).format(new Date(d.fechaCreacion))), cambios: d.versions.length > 1 ? 'SI' : 'NO', version: d.versions.length,
    fechaCreacion: d.fechaCreacion, usuarioCreador: persona(d.ownerId),
    fechaModificacion: d.modificadoEn, usuarioModificador: persona(d.modificadoPor),
    fechaActualizacion: d.actualizadoEn, usuarioActualizador: persona(d.actualizadoPor),
    revisor: d.revisorId ? persona(d.revisorId) : undefined, urlWord: urlDe(d, 'word'), urlPdf: urlDe(d, 'pdf'),
    miPermiso: permissionOf(d, uid)!, versionVigente: current,
  };
}
function detail(d: MockDoc, uid: string): DocumentDetail {
  return {
    ...summary(d, uid),
    versions: [...d.versions].reverse().map(({ content: _c, ...v }) => v),
    reviews: [...d.reviews].reverse(),
  };
}
const touch = (d: MockDoc, uid: string) => { d.modificadoPor = uid; d.modificadoEn = iso(); };
function addLog(docId: string, uid: string, action: AccessLogDTO['action'], extra: Partial<AccessLogDTO> = {}) {
  (state.logs[docId] ??= []).unshift({
    id: nextId('log'), action, userId: uid, userName: userName(uid), createdAt: iso(), ip: '10.0.0.5', channel: 'archivos', ...extra,
  });
}

// ---- rutas ------------------------------------------------------------------
interface Ctx { m: RegExpMatchArray; body: any; query: URLSearchParams; form?: FormData }
type Handler = (c: Ctx) => TransportResponse | Promise<TransportResponse>;
const routes: Array<{ method: string; re: RegExp; auth: boolean; h: Handler }> = [];
const route = (method: string, re: RegExp, h: Handler, auth = true) => routes.push({ method, re, auth, h });

route('POST', /^\/auth\/login$/, ({ body }) => {
  const email = String(body.email ?? '').trim().toLowerCase();
  const user = state.users.find((u) => u.email === email);
  const f = (state.failed[email] ??= { attempts: 0, lockedUntil: 0, level: 0 });
  if (!user) return INVALID();
  if (f.lockedUntil > now()) return INVALID();
  if (user.password !== body.password) {
    f.attempts += 1;
    if (f.attempts >= 5) { f.attempts = 0; f.lockedUntil = now() + [15, 30, 60][Math.min(f.level, 2)] * 60_000; f.level += 1; }
    save();
    return INVALID();
  }
  state.failed[email] = { attempts: 0, lockedUntil: 0, level: 0 };
  if (state.scenario.deviceBlocked) return fail(403, 'DEVICE_BLOCKED', 'Este dispositivo no está autorizado');
  if (!state.scenario.deviceKnown) {
    // Igual que el backend: un dispositivo sin aprobar NO obtiene sesión.
    return ok({ status: 'DEVICE_PENDING', message: 'Dispositivo pendiente de autorización. Un administrador debe aprobarlo.' }, 202);
  }
  if (state.scenario.sessionLimit) return fail(409, 'SESSION_LIMIT', 'Ya tienes 3 sesiones abiertas. Cierra una para continuar.');
  state.session = { userId: user.id, accessExpiresAt: now() + ACCESS_TTL, lastActivityAt: now(), absoluteExpiresAt: now() + ABSOLUTE };
  save();
  return ok({ status: 'OK', user: toCurrent(user), sessionExpiresAt: iso(state.session.absoluteExpiresAt) });
}, false);

route('POST', /^\/auth\/refresh$/, () => {
  const s = state.session;
  if (!s || now() - s.lastActivityAt >= INACTIVITY || now() >= s.absoluteExpiresAt || state.scenario.deviceBlocked) {
    state.session = null; save();
    return UNAUTH();
  }
  s.accessExpiresAt = now() + ACCESS_TTL; s.lastActivityAt = now(); save();
  return ok({ status: 'OK', sessionExpiresAt: iso(s.absoluteExpiresAt) });
}, false);

route('POST', /^\/auth\/logout$/, () => { state.session = null; save(); return { status: 204 }; }, false);
route('POST', /^\/auth\/logout-all$/, () => { state.session = null; save(); return { status: 204 }; }, false);

route('GET', /^\/auth\/me$/, (c: any) => ok(toCurrent(c.user)));

route('POST', /^\/auth\/change-password$/, ({ body, ...c }: any) => {
  const user: MockUser = c.user;
  if (body.currentPassword !== user.password) return fail(400, 'VALIDATION', 'La contraseña actual no es correcta');
  const problems = validatePassword(String(body.newPassword ?? ''), user.email);
  if (problems.length) return fail(400, 'VALIDATION', problems.join('. '));
  if (body.newPassword === user.password) return fail(400, 'VALIDATION', 'No puedes reutilizar ninguna de tus últimas 5 contraseñas');
  user.password = body.newPassword; user.mustChangePassword = false; save();
  return { status: 204 };
});

route('GET', /^\/directory\/users$/, (c: any) =>
  ok(state.users.filter((u) => u.id !== c.user.id && u.email !== 'nueva@empresa.com' && !u.roles?.includes('ADMIN')).map(({ id, name, email }) => ({ id, name, email }))));

route('GET', /^\/documents$/, (c: any) =>
  ok(state.docs.filter((d) => permissionOf(d, c.user.id)).map((d) => summary(d, c.user.id))
    .sort((a, b) => b.fechaModificacion.localeCompare(a.fechaModificacion))));

const CODIGO = /^[A-Z0-9][A-Z0-9._/-]*$/;
route('POST', /^\/documents$/, ({ form, ...c }: any) => {
  const file = form?.get('file') as File | null;
  if (!file || file.size === 0) return fail(400, 'VALIDATION', 'El archivo está vacío');
  if (file.size > 50 * 1024 * 1024) return fail(400, 'VALIDATION', 'El archivo supera el tamaño máximo');

  // Mismas reglas que el backend (domain/document.ts)
  const codigo = String(form?.get('codigo') ?? '').trim().toUpperCase();
  if (codigo.length < 2 || codigo.length > 40) return fail(400, 'VALIDATION', 'El código debe tener entre 2 y 40 caracteres');
  if (!CODIGO.test(codigo)) return fail(400, 'VALIDATION', 'El código solo admite letras, números y los signos . _ / -');
  if (state.docs.some((x) => x.codigo === codigo)) return fail(409, 'CONFLICT', `Ya existe un documento con el código ${codigo}`);
  const nombre = String(form?.get('nombreDocumento') ?? '').trim() || file.name.replace(/\.[^./\\]+$/, '').replace(/_+/g, ' ');
  const estado = String(form?.get('estado') ?? 'BORRADOR');
  if (estado !== 'BORRADOR' && estado !== 'REVISADO') return fail(400, 'VALIDATION', 'El estado inicial debe ser borrador o revisado');
  const rawFecha = String(form?.get('fechaCreacion') ?? '');
  const fecha = rawFecha ? new Date(rawFecha) : new Date(now());
  if (Number.isNaN(fecha.getTime())) return fail(400, 'VALIDATION', 'La fecha de creación no es válida');
  if (fecha.getTime() > now() + 5 * 60_000) return fail(400, 'VALIDATION', 'La fecha de creación no puede ser futura');

  const id = nextId('d');
  const doc: MockDoc = {
    id, codigo, title: nombre, description: String(form?.get('descripcion') ?? '') || undefined, status: estado, ownerId: c.user.id, shares: {},
    fechaCreacion: fecha.toISOString(), modificadoPor: c.user.id, modificadoEn: iso(), actualizadoPor: c.user.id, actualizadoEn: iso(),
    revisorId: estado === 'REVISADO' ? c.user.id : undefined,
    versions: [{
      id: `${id}-v1`, versionNumber: 1, fileName: file.name, mimeType: file.type || 'application/octet-stream', sizeBytes: file.size,
      checksumSha256: fakeChecksum(file.name + file.size), uploadedById: c.user.id, uploadedByName: c.user.name, createdAt: iso(),
      content: `Contenido simulado de "${file.name}" — versión 1.`,
    }],
    reviews: [],
  };
  state.docs.unshift(doc);
  addLog(id, c.user.id, 'SUBIR', { versionNumber: 1 });
  save();
  return ok({ document: summary(doc, c.user.id), version: doc.versions[0] }, 201);
});

route('GET', /^\/documents\/([^/]+)$/, (c: any) => {
  const d = state.docs.find((x) => x.id === c.m[1]);
  return d && permissionOf(d, c.user.id) ? ok(detail(d, c.user.id)) : NOT_FOUND();
});

route('POST', /^\/documents\/([^/]+)\/versions$/, ({ form, ...c }: any) => {
  const d = state.docs.find((x) => x.id === c.m[1]);
  const p = d ? permissionOf(d, c.user.id) : null;
  if (!d || !p) return NOT_FOUND();
  if (p !== 'PROPIETARIO' && p !== 'EDITAR') return fail(403, 'FORBIDDEN', 'No tienes permiso para esta acción');
  const file = form?.get('file') as File | null;
  if (!file || file.size === 0) return fail(400, 'VALIDATION', 'El archivo está vacío');
  const n = d.versions.length + 1;
  d.versions.push({
    id: `${d.id}-v${n}`, versionNumber: n, fileName: file.name, mimeType: file.type || 'application/octet-stream', sizeBytes: file.size,
    checksumSha256: fakeChecksum(file.name + file.size + n), changeNote: String(form?.get('changeNote') ?? '') || undefined,
    uploadedById: c.user.id, uploadedByName: c.user.name, createdAt: iso(), content: `Contenido simulado de "${file.name}" — versión ${n}.`,
  });
  d.actualizadoPor = c.user.id; d.actualizadoEn = iso(); touch(d, c.user.id);
  d.status = d.status === 'APROBADO' ? 'BORRADOR' : d.status;
  addLog(d.id, c.user.id, 'NUEVA_VERSION', { versionNumber: n });
  save();
  return ok(d.versions[n - 1], 201);
});

route('GET', /^\/documents\/([^/]+)\/download$/, (c: any) => {
  const d = state.docs.find((x) => x.id === c.m[1]);
  const p = d ? permissionOf(d, c.user.id) : null;
  if (!d || !p) return NOT_FOUND();
  if (!canDownload(p)) return fail(403, 'FORBIDDEN', 'No tienes permiso para esta acción');
  const v = d.versions.find((x) => x.id === c.query.get('versionId')) ?? d.versions[d.versions.length - 1];
  addLog(d.id, c.user.id, 'DESCARGAR', { versionNumber: v.versionNumber, channel: c.query.get('channel') ?? 'archivos' });
  save();
  return { status: 200, blob: new Blob([v.content], { type: 'text/plain' }) };
});

route('GET', /^\/documents\/([^/]+)\/history$/, (c: any) => {
  const d = state.docs.find((x) => x.id === c.m[1]);
  const p = d ? permissionOf(d, c.user.id) : null;
  if (!d || !p) return NOT_FOUND();
  if (p !== 'PROPIETARIO') return fail(403, 'FORBIDDEN', 'No tienes permiso para esta acción');
  return ok(state.logs[d.id] ?? []);
});

route('POST', /^\/documents\/([^/]+)\/editor-session$/, (c: any) => {
  const d = state.docs.find((x) => x.id === c.m[1]);
  const p = d ? permissionOf(d, c.user.id) : null;
  if (!d || !p) return NOT_FOUND();
  const mode = c.body?.mode ?? 'edit';
  const quiereEditar = mode !== 'view';
  const v = d.versions[d.versions.length - 1];
  const infoMap: Record<string, { fileType: string; documentType: 'word' | 'cell' | 'slide'; editable: boolean }> = {
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': { fileType: 'docx', documentType: 'word', editable: true },
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': { fileType: 'xlsx', documentType: 'cell', editable: true },
    'application/vnd.openxmlformats-officedocument.presentationml.presentation': { fileType: 'pptx', documentType: 'slide', editable: true },
    'text/plain': { fileType: 'txt', documentType: 'word', editable: true },
    'application/pdf': { fileType: 'pdf', documentType: 'word', editable: false },
  };
  const info = infoMap[v.mimeType];
  if (!info) return fail(400, 'VALIDATION', 'Este tipo de archivo no admite edición o visualización en línea');
  if (quiereEditar && !info.editable) return fail(400, 'VALIDATION', 'Los archivos PDF solo admiten visualización en línea');
  if (quiereEditar && p !== 'PROPIETARIO' && p !== 'EDITAR') return fail(403, 'FORBIDDEN', 'No tienes permiso para editar este documento');

  addLog(d.id, c.user.id, quiereEditar ? 'EDITADO' : 'VER', {
    versionNumber: v.versionNumber,
    detail: quiereEditar ? 'Sesión de edición en línea' : 'Lectura en línea',
  });
  save();

  const serverUrl = 'http://localhost:8082';
  return ok({
    documentServerUrl: serverUrl,
    scriptUrl: `${serverUrl}/web-apps/apps/api/documents/api.js`,
    modo: quiereEditar ? 'EDICION' : 'LECTURA',
    config: {
      documentType: info.documentType,
      document: {
        fileType: info.fileType,
        key: `${v.id}_${v.checksumSha256.slice(0, 16)}`,
        title: v.fileName,
        url: `http://host.docker.internal:3000/api/v1/documents/${d.id}/office-content?token=mock`,
        permissions: {
          edit: quiereEditar,
          download: canDownload(p),
          print: canDownload(p),
          review: quiereEditar,
          comment: quiereEditar,
        },
      },
      editorConfig: {
        mode: quiereEditar ? 'edit' : 'view',
        lang: 'es',
        callbackUrl: `http://host.docker.internal:3000/api/v1/documents/${d.id}/office-callback?token=mock`,
        user: { id: c.user.id, name: c.user.name },
        customization: { forcesave: false, autosave: true, compactHeader: false },
      },
      token: 'mock-onlyoffice-jwt-token',
    },
  });
});

route('POST', /^\/documents\/([^/]+)\/reviews$/, (c: any) => {
  const d = state.docs.find((x) => x.id === c.m[1]);
  const p = d ? permissionOf(d, c.user.id) : null;
  if (!d || !p) return NOT_FOUND();
  if (p !== 'PROPIETARIO' && p !== 'EDITAR') return fail(403, 'FORBIDDEN', 'No tienes permiso para esta acción');
  const reviewer = state.users.find((u) => u.id === c.body.reviewerId);
  if (!reviewer) return fail(400, 'VALIDATION', 'Revisor no válido');
  const v = d.versions[d.versions.length - 1];
  d.shares[reviewer.id] ??= 'DESCARGAR';
  const review = {
    id: nextId('r'), versionId: v.id, versionNumber: v.versionNumber, reviewerId: reviewer.id, reviewerName: reviewer.name,
    requestedByName: c.user.name, decision: 'PENDIENTE' as const, requestedAt: iso(),
  };
  d.reviews.push(review); d.status = 'EN_REVISION'; d.revisorId = reviewer.id; touch(d, c.user.id);
  addLog(d.id, c.user.id, 'REVISION_SOLICITADA', { versionNumber: v.versionNumber, detail: `Revisor: ${reviewer.name}` });
  save();
  return ok(review, 201);
});

route('PATCH', /^\/reviews\/([^/]+)$/, (c: any) => {
  for (const d of state.docs) {
    const r = d.reviews.find((x) => x.id === c.m[1]);
    if (!r) continue;
    if (r.reviewerId !== c.user.id) return fail(403, 'FORBIDDEN', 'Solo el revisor asignado puede decidir');
    if (r.decision !== 'PENDIENTE') return fail(400, 'VALIDATION', 'La revisión ya fue resuelta');
    r.decision = c.body.decision; r.comment = c.body.comment; r.decidedAt = iso();
    d.status = r.decision === 'APROBADO' ? 'APROBADO' : r.decision === 'RECHAZADO' ? 'RECHAZADO' : 'BORRADOR';
    touch(d, c.user.id); d.revisorId = c.user.id;
    addLog(d.id, c.user.id, 'REVISION_DECIDIDA', {
      versionNumber: r.versionNumber,
      detail: { APROBADO: 'Aprobado', RECHAZADO: 'Rechazado', CAMBIOS_SOLICITADOS: 'Pidió cambios' }[r.decision as string],
    });
    save();
    return ok();
  }
  return fail(404, 'NOT_FOUND', 'Revisión no encontrada');
});

// ---- chat -------------------------------------------------------------------
route('GET', /^\/conversations$/, (c: any) =>
  ok(state.conversations.filter((x) => x.memberIds.includes(c.user.id)).map(({ memberIds: _m, ...x }): ConversationDTO => {
    const last = state.messages.filter((m) => m.conversationId === x.id).at(-1);
    return { ...x, lastMessage: last ? { text: last.content ?? `📎 ${last.attachments[0]?.fileName ?? 'Archivo'}`, at: last.createdAt } : undefined };
  })));

route('GET', /^\/conversations\/([^/]+)\/messages$/, (c: any) => {
  const conv = state.conversations.find((x) => x.id === c.m[1]);
  if (!conv || !conv.memberIds.includes(c.user.id)) return fail(404, 'NOT_FOUND', 'Conversación no encontrada');
  conv.unread = 0; save();
  return ok(state.messages.filter((m) => m.conversationId === conv.id));
});

route('POST', /^\/conversations\/([^/]+)\/messages$/, (c: any) => {
  const conv = state.conversations.find((x) => x.id === c.m[1]);
  if (!conv || !conv.memberIds.includes(c.user.id)) return fail(404, 'NOT_FOUND', 'Conversación no encontrada');
  const content = String(c.body.content ?? '').trim();
  const attachments = [] as MessageDTO['attachments'];
  for (const a of c.body.attachments ?? []) {
    const d = state.docs.find((x) => x.id === a.documentId);
    const p = d ? permissionOf(d, c.user.id) : null;
    if (!d || !canDownload(p)) return fail(404, 'NOT_FOUND', 'Documento no encontrado');
    const v = d.versions[d.versions.length - 1];
    attachments.push({ documentId: d.id, versionId: v.id, versionNumber: v.versionNumber, fileName: v.fileName, mimeType: v.mimeType, sizeBytes: v.sizeBytes });
    for (const mid of conv.memberIds.filter((id) => id !== c.user.id)) {
      if (!d.shares[mid] && d.ownerId !== mid) d.shares[mid] = 'DESCARGAR';
    }
    addLog(d.id, c.user.id, 'COMPARTIR', { versionNumber: v.versionNumber, channel: `chat:${conv.id}`, detail: `Compartido en «${conv.name}»` });
  }
  if (!content && attachments.length === 0) return fail(400, 'VALIDATION', 'Mensaje vacío');
  const message: MessageDTO = {
    id: nextId('m'), conversationId: conv.id, authorId: c.user.id, authorName: c.user.name,
    content: content || undefined, attachments, createdAt: iso(),
  };
  state.messages.push(message); save();

  // Respuesta simulada de otro miembro, para ver el tiempo real en la interfaz.
  const other = state.users.find((u) => conv.memberIds.includes(u.id) && u.id !== c.user.id);
  if (other) {
    setTimeout(() => listeners.forEach((l) => l({ type: 'typing', conversationId: conv.id, name: other.name, on: true })), 500);
    setTimeout(() => {
      const reply: MessageDTO = {
        id: nextId('m'), conversationId: conv.id, authorId: other.id, authorName: other.name,
        content: attachments.length ? 'Recibido, ya lo descargué. Gracias.' : 'Entendido 👍', attachments: [], createdAt: iso(),
      };
      state.messages.push(reply); save();
      listeners.forEach((l) => l({ type: 'typing', conversationId: conv.id, name: other.name, on: false }));
      listeners.forEach((l) => l({ type: 'message:new', message: reply }));
    }, 2400);
  }
  return ok(message, 201);
});

// ---- transporte -------------------------------------------------------------
export const mockTransport: Transport = async (path, init) => {
  await delay(90 + Math.random() * 160);
  if (state.scenario.serverDown) throw new Error('mock: servidor caído');

  const method = (init.method ?? 'GET').toUpperCase();
  const url = new URL(path, 'http://mock.local');
  const form = init.body instanceof FormData ? init.body : undefined;
  const body = typeof init.body === 'string' ? JSON.parse(init.body) : {};

  for (const r of routes) {
    if (r.method !== method) continue;
    const m = url.pathname.match(r.re);
    if (!m) continue;
    const ctx: any = { m, body, query: url.searchParams, form };
    if (r.auth) {
      const a = authenticate();
      if (isResponse(a)) return a;
      ctx.user = a.user;
      // Igual que el backend: con "debe cambiar contraseña" solo se permite me / change-password.
      if (a.user.mustChangePassword && !/^\/auth\/(me|change-password)$/.test(url.pathname)) {
        return fail(403, 'PASSWORD_CHANGE_REQUIRED', 'Debes cambiar tu contraseña antes de continuar');
      }
    }
    return r.h(ctx);
  }
  return fail(404, 'NOT_FOUND', `Ruta no simulada: ${method} ${url.pathname}`);
};
