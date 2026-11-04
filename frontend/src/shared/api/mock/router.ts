// Backend SIMULADO. Responde como el real (mismos códigos, mismos mensajes y mismas reglas de sesión),
// pero todo en memoria del navegador. Solo se carga si VITE_USE_MOCKS=true.
import type { Transport, TransportResponse } from '../http';
import type { AccessLogDTO, ConversationDTO, CurrentUser, DocumentDetail, DocumentSummary, MessageDTO, MyPermission, UserLite, ImageDTO, QuoteDTO, ReceiptDTO, ReceiptUpdateDTO, MessageTraceDTO } from '../types';
import {
  fakeChecksum, initialState, loadState, MockDoc, MockState, MockUser, persist, wipeStorage,
} from './state';

const INACTIVITY = 30 * 60_000;
const ACCESS_TTL = 15 * 60_000;
const ABSOLUTE = 12 * 3_600_000;
const COMMON = new Set(['password1234', '123456789012', 'qwertyuiop12', 'changeme1234']);

let state: MockState = loadState();
type BusEvent =
  | { type: 'message:new'; message: MessageDTO }
  | { type: 'typing'; conversationId: string; name: string; on: boolean }
  | { type: 'receipt:update'; update: ReceiptUpdateDTO }
  | { type: 'message:edited'; message: MessageDTO };
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

// Simula que otra pestaña está renovando la misma sesión: los próximos N refrescos responden "reintenta".
let refreshRaces = 0;

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
  raceRefresh(times: number) { refreshRaces = times; },
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

route('GET', /^\/auth\/config$/, () => ok({
  captcha: { enabled: state.scenario.captchaEnabled, siteKey: state.scenario.captchaEnabled ? 'mock-site-key' : null },
  google: { enabled: state.scenario.googleEnabled, clientId: state.scenario.googleEnabled ? 'mock-client-id' : null },
  passwordReset: { enabled: state.scenario.passwordResetEnabled },
}), false);

// Recuperar contraseña (simulado): el código válido es siempre 123456; 5 fallos lo invalidan, igual que el servidor.
const MOCK_RESET_CODE = '123456';
let resetFailures = 0;
let resetRequested = false;
route('POST', /^\/auth\/password-reset\/request$/, ({ body }) => {
  if (!state.scenario.passwordResetEnabled) return fail(403, 'PASSWORD_RESET_DISABLED', 'La recuperación de contraseña no está habilitada');
  if (state.scenario.captchaEnabled && !body.captchaToken) return fail(400, 'CAPTCHA_FAILED', 'Completa la verificación de seguridad e inténtalo de nuevo');
  resetFailures = 0; resetRequested = true;
  return ok({ status: 'ACCEPTED', message: 'Si el correo está registrado, te enviamos un código de verificación.' }, 202); // igual exista o no
}, false);
route('POST', /^\/auth\/password-reset\/confirm$/, ({ body }) => {
  if (!state.scenario.passwordResetEnabled) return fail(403, 'PASSWORD_RESET_DISABLED', 'La recuperación de contraseña no está habilitada');
  const user = state.users.find((u) => u.email === String(body.email ?? '').trim().toLowerCase());
  const bad = () => fail(400, 'INVALID_RESET_CODE', 'El código es incorrecto o venció. Solicita uno nuevo.');
  if (!user || !resetRequested || resetFailures >= 5) return bad();
  if (body.code !== MOCK_RESET_CODE) { resetFailures += 1; return bad(); }
  const problems = validatePassword(String(body.newPassword ?? ''), user.email);
  if (problems.length) return fail(400, 'VALIDATION', problems.join('. '));
  if (user.password === body.newPassword) return fail(400, 'VALIDATION', 'No puedes reutilizar ninguna de tus últimas 5 contraseñas');
  user.password = String(body.newPassword); user.mustChangePassword = false; resetRequested = false;
  state.session = null; save();
  return { status: 204 };
}, false);

/** Dispositivo, límite de sesiones y apertura de sesión: común a la contraseña y a Google. */
function openMockSession(user: MockUser): TransportResponse {
  if (state.scenario.deviceBlocked) return fail(403, 'DEVICE_BLOCKED', 'Este dispositivo no está autorizado');
  if (!state.scenario.deviceKnown) {
    // Igual que el backend: un dispositivo sin aprobar NO obtiene sesión.
    return ok({ status: 'DEVICE_PENDING', message: 'Dispositivo pendiente de autorización. Un administrador debe aprobarlo.' }, 202);
  }
  if (state.scenario.sessionLimit) return fail(409, 'SESSION_LIMIT', 'Ya tienes 3 sesiones abiertas. Cierra una para continuar.');
  state.session = { userId: user.id, accessExpiresAt: now() + ACCESS_TTL, lastActivityAt: now(), absoluteExpiresAt: now() + ABSOLUTE };
  save();
  return ok({ status: 'OK', user: toCurrent(user), sessionExpiresAt: iso(state.session.absoluteExpiresAt) });
}

// Google (simulado): el "ID token" válido es `mock:<correo>` y el correo debe pertenecer a un usuario existente (no hay auto-registro).
route('POST', /^\/auth\/google$/, ({ body }) => {
  if (!state.scenario.googleEnabled) return fail(403, 'GOOGLE_DISABLED', 'El acceso con Google no está habilitado');
  const email = String(body.idToken ?? '').startsWith('mock:') ? String(body.idToken).slice(5).trim().toLowerCase() : '';
  const user = state.users.find((u) => u.email === email);
  if (!user) {
    // Igual que el backend: se registra y queda pendiente; no obtiene sesión hasta que un administrador la active.
    if (email && state.scenario.googleAutoRegister) return fail(403, 'ACCOUNT_PENDING_ACTIVATION', 'Tu cuenta aún no está activada. Contacta a un administrador para que la active.');
    return INVALID();
  }
  return openMockSession(user);
}, false);

route('POST', /^\/auth\/login$/, ({ body }) => {
  if (state.scenario.captchaEnabled && !body.captchaToken) {
    return fail(400, 'CAPTCHA_FAILED', 'Completa la verificación de seguridad e inténtalo de nuevo');
  }
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
  return openMockSession(user);
}, false);

route('POST', /^\/auth\/refresh$/, () => {
  if (refreshRaces > 0) { refreshRaces--; return fail(401, 'REFRESH_IN_PROGRESS', 'La sesión se está renovando; reintenta'); }
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

route('GET', /^\/conversations\/contacts$/, (c: any) => {
  const q = (c.query.get('q') ?? '').trim().toLowerCase();
  return ok(state.users.filter((u) => u.id !== c.user.id && `${u.name} ${u.email}`.toLowerCase().includes(q))
    .sort((a, b) => a.name.localeCompare(b.name)).slice(0, 30).map(({ id, name, email }) => ({ id, name, email })));
});

// Mismas reglas que el servidor: un solo chat directo por pareja; grupos con nombre y 2+ personas además del creador.
route('POST', /^\/conversations$/, (c: any) => {
  const memberIds = [...new Set<string>(c.body.memberIds ?? [])].filter((id) => id !== c.user.id);
  const people = memberIds.map((id) => state.users.find((u) => u.id === id));
  const bad = () => fail(400, 'VALIDATION', 'Alguna de las personas elegidas no está disponible');
  if (c.body.type === 'DIRECT') {
    if (memberIds.length !== 1) return fail(400, 'VALIDATION', 'Un chat directo es con una sola persona');
    if (!people[0]) return bad();
    const existing = state.conversations.find((x) => x.type === 'DIRECT' && x.memberIds.includes(c.user.id) && x.memberIds.includes(memberIds[0]));
    const toDto = ({ memberIds: _m, ...x }: (typeof state.conversations)[number]): ConversationDTO => x;
    if (existing) return ok({ created: false, conversation: toDto(existing) }, 201);
    const conv = { id: nextId('c'), type: 'DIRECT' as const, name: people[0].name, members: [c.user, people[0]].map(({ id, name, email }: UserLite) => ({ id, name, email })), memberIds: [c.user.id, memberIds[0]], unread: 0 };
    state.conversations.push(conv); save();
    return ok({ created: true, conversation: toDto(conv) }, 201);
  }
  if (c.body.type !== 'GROUP') return fail(400, 'VALIDATION', 'Tipo de conversación inválido');
  const name = String(c.body.name ?? '').trim().replace(/\s+/g, ' ');
  if (name.length < 2 || name.length > 80) return fail(400, 'VALIDATION', 'El nombre del grupo debe tener entre 2 y 80 caracteres');
  if (memberIds.length < 2) return fail(400, 'VALIDATION', 'Un grupo necesita al menos 2 personas además de ti');
  if (people.some((p) => !p)) return bad();
  const conv = { id: nextId('c'), type: 'GROUP' as const, name, members: [c.user, ...people].map((u: UserLite) => ({ id: u.id, name: u.name, email: u.email })), memberIds: [c.user.id, ...memberIds], unread: 0 };
  state.conversations.push(conv); save();
  const { memberIds: _m, ...dto } = conv;
  return ok({ created: true, conversation: dto }, 201);
});

route('POST', /^\/conversations\/([^/]+)\/read$/, (c: any) => {
  const conv = state.conversations.find((x) => x.id === c.m[1]);
  if (!conv || !conv.memberIds.includes(c.user.id)) return fail(403, 'FORBIDDEN', 'No perteneces a esta conversación');
  conv.unread = 0; save();
  return { status: 204 };
});

/** Lo que ve cada persona: solo el autor ve los acuses de sus mensajes; el historial de ediciones nunca sale. */
const viewFor = (m: MessageDTO, userId: string): MessageDTO => {
  const { receipts, _edits, ...rest } = m as MessageDTO & { _edits?: unknown };
  void _edits;
  return userId === m.authorId && receipts ? { ...rest, receipts } : rest;
};

/** El servidor registra «entregado» y «leído» una sola vez: la primera hora queda fija. */
function markReceipts(m: MessageDTO, user: { id: string; name: string }, level: 'delivered' | 'read') {
  const t = iso();
  const list = (m.receipts ??= []);
  let r = list.find((x) => x.userId === user.id);
  if (!r) { r = { userId: user.id, userName: user.name, deliveredAt: null, readAt: null }; list.push(r); }
  if (!r.deliveredAt) r.deliveredAt = t;
  if (level === 'read' && !r.readAt) r.readAt = t;
  return r;
}

route('GET', /^\/conversations\/([^/]+)\/messages$/, (c: any) => {
  const conv = state.conversations.find((x) => x.id === c.m[1]);
  if (!conv || !conv.memberIds.includes(c.user.id)) return fail(404, 'NOT_FOUND', 'Conversación no encontrada');
  const all = state.messages.filter((m) => m.conversationId === conv.id); // en orden cronológico (inserción)
  const before = c.query.get('before');
  const limit = Math.min(Math.max(Number(c.query.get('limit')) || 20, 1), 50);
  let end = all.length;
  if (before) {
    const at = all.findIndex((m) => m.id === before);
    if (at < 0) return fail(400, 'VALIDATION', 'Cursor de paginación inválido');
    end = at;
  } else { // solo abrir la conversación la marca como leída
    conv.unread = 0;
    for (const m of all.filter((x) => x.authorId !== c.user.id)) markReceipts(m, c.user, 'read');
    save();
  }
  const start = Math.max(0, end - limit);
  return ok({ items: all.slice(start, end).map((m) => viewFor(m, c.user.id)), nextCursor: start > 0 ? all[start].id : null });
});

const stagedImages = new Map<string, ImageDTO & { uploaderId: string; conversationId: string }>();
const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];

route('POST', /^\/conversations\/([^/]+)\/images$/, (c: any) => {
  const conv = state.conversations.find((x) => x.id === c.m[1]);
  if (!conv || !conv.memberIds.includes(c.user.id)) return fail(403, 'FORBIDDEN', 'No perteneces a esta conversación');
  const file = c.form?.get('file') as File | null;
  if (!file || !file.size) return fail(400, 'VALIDATION', 'Falta la imagen');
  if (file.size > 5 * 1024 * 1024) return fail(400, 'VALIDATION', 'La imagen no puede superar 5 MB');
  if (!IMAGE_TYPES.includes(file.type)) return fail(400, 'VALIDATION', 'Solo se aceptan imágenes PNG, JPEG, GIF o WebP válidas');
  const mine = [...stagedImages.values()].filter((i) => i.uploaderId === c.user.id && i.conversationId === conv.id);
  if (mine.length >= 20) return fail(400, 'VALIDATION', 'Tienes demasiadas imágenes sin enviar en esta conversación');
  const url = typeof URL.createObjectURL === 'function'
    ? URL.createObjectURL(file)
    : `data:image/svg+xml;utf8,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="640" height="480"><rect width="640" height="480" fill="#94a3b8"/></svg>')}`;
  const image = { id: nextId('img'), fileName: file.name || 'imagen', mimeType: file.type, sizeBytes: file.size, width: 640, height: 480, url };
  stagedImages.set(image.id, { ...image, uploaderId: c.user.id, conversationId: conv.id });
  return ok(image, 201);
});

route('PATCH', /^\/conversations\/([^/]+)\/messages\/([^/]+)$/, (c: any) => {
  const conv = state.conversations.find((x) => x.id === c.m[1]);
  if (!conv || !conv.memberIds.includes(c.user.id)) return fail(403, 'FORBIDDEN', 'No perteneces a esta conversación');
  const msg = state.messages.find((x) => x.id === c.m[2] && x.conversationId === conv.id);
  if (!msg) return fail(404, 'NOT_FOUND', 'Mensaje no encontrado');
  if (msg.authorId !== c.user.id) return fail(403, 'FORBIDDEN', 'Solo puedes editar tus propios mensajes');
  const recent = state.messages.filter((x) => x.conversationId === conv.id && x.authorId === c.user.id).slice(-3).map((x) => x.id);
  if (!recent.includes(msg.id)) return fail(403, 'FORBIDDEN', 'Solo puedes editar tus últimos 3 mensajes de esta conversación');
  if (typeof c.body.content !== 'string') return fail(400, 'VALIDATION', 'El mensaje debe ser texto');
  const content = c.body.content.trim();
  if (content.length > 4000) return fail(400, 'VALIDATION', 'El mensaje no puede superar 4000 caracteres');
  const hasMedia = msg.attachments.length + (msg.images?.length ?? 0) > 0;
  if (!content && !hasMedia) return fail(400, 'VALIDATION', 'El mensaje no puede quedar vacío');
  if (content === (msg.content ?? '').trim()) return fail(400, 'VALIDATION', 'No hay cambios que guardar');
  const holder = msg as MessageDTO & { _edits?: Array<{ at: string; editorId: string; previousContent?: string }> };
  (holder._edits ??= []).push({ at: iso(), editorId: c.user.id, previousContent: msg.content });
  msg.content = content || undefined;
  msg.editedAt = holder._edits.at(-1)!.at;
  save();
  return ok(viewFor(msg, c.user.id));
});

route('GET', /^\/conversations\/([^/]+)\/messages\/([^/]+)\/trace$/, (c: any) => {
  const conv = state.conversations.find((x) => x.id === c.m[1]);
  if (!conv || !conv.memberIds.includes(c.user.id)) return fail(403, 'FORBIDDEN', 'No perteneces a esta conversación');
  const msg = state.messages.find((x) => x.id === c.m[2] && x.conversationId === conv.id);
  if (!msg) return fail(404, 'NOT_FOUND', 'Mensaje no encontrado');
  if (msg.authorId !== c.user.id) return fail(403, 'FORBIDDEN', 'Solo quien envió el mensaje puede ver su historial de entrega');
  const receipts: ReceiptDTO[] = [...(msg.receipts ?? [])].sort((a, b) => a.userName.localeCompare(b.userName));
  const status: MessageTraceDTO['status'] = receipts.length && receipts.every((r) => r.readAt) ? 'READ'
    : receipts.length && receipts.every((r) => r.deliveredAt || r.readAt) ? 'DELIVERED' : 'SENT';
  const edits = (msg as MessageDTO & { _edits?: MessageTraceDTO['edits'] })._edits ?? [];
  return ok({ messageId: msg.id, sentAt: msg.createdAt, status, receipts, edits } satisfies MessageTraceDTO);
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
  // Responder: el mensaje citado debe ser de ESTA conversación.
  let replyTo: QuoteDTO | undefined;
  if (c.body.replyToId) {
    const q = state.messages.find((x) => x.id === c.body.replyToId && x.conversationId === conv.id);
    if (!q) return fail(400, 'VALIDATION', 'El mensaje al que respondes no existe en esta conversación');
    replyTo = {
      id: q.id, authorId: q.authorId, authorName: q.authorName, text: q.content?.trim() || ((q.images?.length ?? 0) > 0 ? 'Foto' : 'Documento'),
      kind: (q.images?.length ?? 0) > 0 ? 'IMAGE' : q.attachments.length > 0 ? 'DOCUMENT' : 'TEXT',
    };
  }
  // Fotos: solo las que esta persona subió a esta conversación y que nadie usó.
  const imageIds: string[] = c.body.imageIds ?? [];
  if (new Set(imageIds).size !== imageIds.length) return fail(400, 'VALIDATION', 'Imágenes repetidas');
  if (imageIds.length > 10) return fail(400, 'VALIDATION', 'Máximo 10 imágenes por mensaje');
  const images: ImageDTO[] = [];
  for (const id of imageIds) {
    const im = stagedImages.get(id);
    if (!im || im.uploaderId !== c.user.id || im.conversationId !== conv.id) return fail(400, 'VALIDATION', 'Alguna imagen ya no está disponible; vuelve a subirla');
    images.push({ id: im.id, fileName: im.fileName, mimeType: im.mimeType, sizeBytes: im.sizeBytes, width: im.width, height: im.height, url: im.url });
  }
  if (!content && attachments.length === 0 && images.length === 0) return fail(400, 'VALIDATION', 'Mensaje vacío');
  imageIds.forEach((id) => stagedImages.delete(id));

  const recipients = state.users.filter((u) => conv.memberIds.includes(u.id) && u.id !== c.user.id);
  const message: MessageDTO = {
    id: nextId('m'), conversationId: conv.id, authorId: c.user.id, authorName: c.user.name,
    content: content || undefined, attachments, createdAt: iso(),
    ...(images.length ? { images } : {}), ...(replyTo ? { replyToId: replyTo.id, replyTo } : {}),
    receipts: recipients.map((u) => ({ userId: u.id, userName: u.name, deliveredAt: null, readAt: null })),
  };
  state.messages.push(message); save();

  const publish = (u: { id: string; name: string }, level: 'delivered' | 'read') => {
    const r = markReceipts(message, u, level); save();
    listeners.forEach((l) => l({ type: 'receipt:update', update: { conversationId: conv.id, userId: u.id, userName: u.name, items: [{ messageId: message.id, deliveredAt: r.deliveredAt, readAt: r.readAt }] } }));
  };
  // Quienes están «conectados» lo reciben enseguida (todos menos el último miembro, que se queda sin recibir: se ve el estado pendiente).
  const online = recipients.length > 2 ? recipients.slice(0, -1) : recipients;
  online.forEach((u, i) => setTimeout(() => publish(u, 'delivered'), 500 + i * 250));

  // Respuesta simulada de otro miembro, para ver el tiempo real en la interfaz.
  const other = recipients[0];
  if (other) {
    setTimeout(() => listeners.forEach((l) => l({ type: 'typing', conversationId: conv.id, name: other.name, on: true })), 900);
    setTimeout(() => {
      publish(other, 'read'); // quien responde ya lo leyó
      const reply: MessageDTO = {
        id: nextId('m'), conversationId: conv.id, authorId: other.id, authorName: other.name,
        content: attachments.length ? 'Recibido, ya lo descargué. Gracias.' : images.length ? '¡Qué buena foto! 👌' : 'Entendido 👍', attachments: [], createdAt: iso(),
      };
      state.messages.push(reply); save();
      listeners.forEach((l) => l({ type: 'typing', conversationId: conv.id, name: other.name, on: false }));
      listeners.forEach((l) => l({ type: 'message:new', message: reply }));
    }, 2600);
  }
  return ok(viewFor(message, c.user.id), 201);
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
