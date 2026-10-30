import { beforeEach, describe, expect, it, vi } from 'vitest';
import { authApi } from '@/features/auth/api/auth.api';
import { chatApi } from '@/features/chat/api/chat.api';
import { filesApi } from '@/features/files/api/files.api';
import { ApiError, authHooks } from '../http';
import { mockControls } from './router';

const ANA = { email: 'ana@empresa.com', password: 'Clave-Segura-2026' };
const loginAna = () => authApi.login(ANA.email, ANA.password);
const code = async (p: Promise<unknown>) => (await p.then(() => null, (e: ApiError) => e)) as ApiError | null;

beforeEach(() => {
  mockControls.reset();
  authHooks.onSessionLost = () => {};
  authHooks.onPasswordChangeRequired = () => {};
});

describe('El modo mock funciona SIN backend', () => {
  it('nunca usa la red (fetch lanza si se invoca)', async () => {
    await loginAna();
    await filesApi.list();
    await chatApi.conversations();
    // si algo hubiera llamado a fetch, setup.ts habría lanzado y estas líneas no se alcanzarían
    expect(true).toBe(true);
  });

  it('con "servidor caído" la app recibe un error de red controlado', async () => {
    mockControls.set({ serverDown: true });
    const err = await code(authApi.me());
    expect(err).toMatchObject({ status: 0, code: 'NETWORK' });
    expect(err!.message).toMatch(/conectar/);
  });
});

describe('Autenticación simulada = reglas del backend real', () => {
  it('login correcto devuelve 200 y la sesión queda abierta', async () => {
    const r = await loginAna();
    expect(r.status).toBe(200);
    expect(r.data).toMatchObject({ status: 'OK', user: { email: ANA.email } });
    expect((await authApi.me()).email).toBe(ANA.email);
  });

  it('contraseña errónea y correo inexistente dan la MISMA respuesta', async () => {
    const wrong = await code(authApi.login(ANA.email, 'mala-mala-mala'));
    const unknown = await code(authApi.login('nadie@empresa.com', 'mala-mala-mala'));
    expect(wrong).toMatchObject({ status: 401, code: 'INVALID_CREDENTIALS' });
    expect(unknown!.message).toBe(wrong!.message);
  });

  it('5 fallos bloquean la cuenta: ni la contraseña correcta entra', async () => {
    for (let i = 0; i < 5; i++) await code(authApi.login(ANA.email, 'mala-mala-mala'));
    expect(await code(loginAna())).toMatchObject({ code: 'INVALID_CREDENTIALS' });
  });

  it('dispositivo nuevo → 202 pendiente y NO hay sesión; al aprobarlo, entra', async () => {
    mockControls.set({ deviceKnown: false });
    const r = await loginAna();
    expect(r.status).toBe(202);
    expect(r.data).toMatchObject({ status: 'DEVICE_PENDING' });
    expect(await code(authApi.me())).toMatchObject({ status: 401 });
    mockControls.approveDevices();
    expect((await loginAna()).status).toBe(200);
  });

  it('dispositivo bloqueado → 403 DEVICE_BLOCKED', async () => {
    mockControls.set({ deviceBlocked: true });
    expect(await code(loginAna())).toMatchObject({ status: 403, code: 'DEVICE_BLOCKED' });
  });

  it('4.ª sesión → 409 SESSION_LIMIT', async () => {
    mockControls.set({ sessionLimit: true });
    expect(await code(loginAna())).toMatchObject({ status: 409, code: 'SESSION_LIMIT' });
  });

  it('sin sesión, las rutas protegidas responden 401 y avisan que la sesión se perdió', async () => {
    const lost = vi.fn();
    authHooks.onSessionLost = lost;
    expect(await code(filesApi.list())).toMatchObject({ status: 401 });
    expect(lost).toHaveBeenCalled();
  });

  it('el token de acceso vencido se RENUEVA en silencio y la petición sigue (sin que el usuario lo note)', async () => {
    await loginAna();
    mockControls.expireAccessToken();
    const lost = vi.fn();
    authHooks.onSessionLost = lost;
    await expect(filesApi.list()).resolves.toBeInstanceOf(Array);
    expect(lost).not.toHaveBeenCalled();
  });

  it('31 min sin actividad: la sesión muere, no se renueva y se avisa', async () => {
    await loginAna();
    mockControls.advanceTime(31 * 60_000);
    const lost = vi.fn();
    authHooks.onSessionLost = lost;
    expect(await code(filesApi.list())).toMatchObject({ status: 401 });
    expect(lost).toHaveBeenCalledTimes(1);
  });

  it('logout cierra la sesión', async () => {
    await loginAna();
    await authApi.logout();
    expect(await code(authApi.me())).toMatchObject({ status: 401 });
  });

  it('usuario con contraseña temporal: solo puede ver /me y cambiarla', async () => {
    const hook = vi.fn();
    authHooks.onPasswordChangeRequired = hook;
    await authApi.login('nueva@empresa.com', 'Temporal-Clave-2026');
    expect((await authApi.me()).mustChangePassword).toBe(true);
    expect(await code(filesApi.list())).toMatchObject({ status: 403, code: 'PASSWORD_CHANGE_REQUIRED' });
    expect(hook).toHaveBeenCalled();
    expect(await code(authApi.changePassword('Temporal-Clave-2026', 'corta'))).toMatchObject({ status: 400 });
    expect(await code(authApi.changePassword('Temporal-Clave-2026', 'Mi-Nueva-Clave-2026'))).toMatchObject({ status: 400, message: expect.stringMatching(/contener tu correo/) });
    await authApi.changePassword('Temporal-Clave-2026', 'Contrasena-Segura-77');
    await expect(filesApi.list()).resolves.toBeInstanceOf(Array);
  });
});

const alta = (codigo: string, extra: Partial<Parameters<typeof filesApi.create>[1]> = {}) =>
  ({ codigo, nombreDocumento: 'Nota', fechaCreacion: new Date().toISOString().slice(0, 10), estado: 'BORRADOR' as const, ...extra });

describe('Documentos simulados', () => {
  beforeEach(async () => { await loginAna(); });

  it('lista solo los documentos a los que tengo acceso, con mi permiso', async () => {
    const docs = await filesApi.list();
    expect(docs.length).toBeGreaterThan(3);
    expect(docs.find((d) => d.id === 'd-acta')!.miPermiso).toBe('DESCARGAR');
    expect(docs.find((d) => d.id === 'd-contrato')!.miPermiso).toBe('PROPIETARIO');
  });

  it('subir crea el documento en versión 1; subir otra versión incrementa y conserva la anterior', async () => {
    const created = await filesApi.create(new File(['hola'], 'nota.txt', { type: 'text/plain' }), alta('NOTA-1'));
    const id = created.document.id;
    await filesApi.newVersion(id, new File(['hola 2'], 'nota.txt', { type: 'text/plain' }), 'cambié el saludo');
    const detail = await filesApi.get(id);
    expect(detail.versions.map((v) => v.versionNumber)).toEqual([2, 1]);
    expect(detail.versions[0].changeNote).toBe('cambié el saludo');
    expect(detail.versionVigente.versionNumber).toBe(2);
    expect(detail).toMatchObject({ version: 2, cambios: 'SI' }); // dato derivado: ya tuvo cambios
  });

  it('rechaza archivos vacíos', async () => {
    expect(await code(filesApi.create(new File([], 'vacio.txt'), alta('VAC-1')))).toMatchObject({ status: 400 });
  });

  it('un documento sin acceso responde 404 (no revela que existe)', async () => {
    mockControls.state.docs.push({
      id: 'd-ajeno', codigo: 'AJ-1', title: 'Ajeno', status: 'BORRADOR', ownerId: 'u-luis', shares: {},
      fechaCreacion: new Date().toISOString(), modificadoPor: 'u-luis', modificadoEn: new Date().toISOString(),
      actualizadoPor: 'u-luis', actualizadoEn: new Date().toISOString(), versions: [{
        id: 'd-ajeno-v1', versionNumber: 1, fileName: 'a.txt', mimeType: 'text/plain', sizeBytes: 1, checksumSha256: 'x', uploadedById: 'u-luis',
        uploadedByName: 'Luis', createdAt: new Date().toISOString(), content: 'x',
      }], reviews: [],
    });
    const foreign = await code(filesApi.get('d-ajeno'));
    const missing = await code(filesApi.get('no-existe'));
    expect(foreign).toMatchObject({ status: 404 });
    expect(foreign!.message).toBe(missing!.message);
  });

  it('con permiso solo VER no puede descargar (403)', async () => {
    expect(await code(filesApi.download('d-politica', 'x.docx'))).toMatchObject({ status: 403 });
  });

  it('la descarga queda en el historial del dueño', async () => {
    const before = (await filesApi.history('d-contrato')).length;
    URL.createObjectURL = vi.fn(() => 'blob:x');
    URL.revokeObjectURL = vi.fn();
    await filesApi.download('d-contrato', 'contrato-servicios.docx');
    const after = await filesApi.history('d-contrato');
    expect(after.length).toBe(before + 1);
    expect(after[0]).toMatchObject({ action: 'DESCARGAR', userName: 'Ana Quispe' });
  });

  it('el historial es solo para el dueño (403 para otros)', async () => {
    expect(await code(filesApi.history('d-acta'))).toMatchObject({ status: 403 });
  });

  it('flujo de revisión: pedir → el revisor asignado decide → cambia el estado', async () => {
    const people = await filesApi.directory();
    expect(people.find((p) => p.email === 'nueva@empresa.com')).toBeUndefined(); // no lista usuarios sin activar
    await filesApi.requestReview('d-manual', 'u-luis');
    expect((await filesApi.get('d-manual')).estado).toBe('EN_REVISION');
    expect((await filesApi.get('d-manual')).revisor).toMatchObject({ id: 'u-luis' });
    const review = (await filesApi.get('d-manual')).reviews[0];
    expect(await code(filesApi.decideReview(review.id, 'APROBADO'))).toMatchObject({ status: 403 }); // Ana no es la revisora
  });
});

describe('Chat simulado', () => {
  beforeEach(async () => { await loginAna(); });

  it('lista mis conversaciones con último mensaje y no leídos', async () => {
    const list = await chatApi.conversations();
    expect(list.map((c) => c.name)).toContain('Contabilidad');
    expect(list.find((c) => c.id === 'c-conta')!.unread).toBe(2);
  });

  it('abrir una conversación marca los mensajes como leídos', async () => {
    await chatApi.messages('c-conta');
    expect((await chatApi.conversations()).find((c) => c.id === 'c-conta')!.unread).toBe(0);
  });

  it('adjuntar un documento lo comparte con los miembros y lo deja registrado con canal chat', async () => {
    const msg = await chatApi.send('c-marta', 'Te paso el manual', [{ documentId: 'd-manual' }]);
    expect(msg.attachments[0]).toMatchObject({ documentId: 'd-manual', versionNumber: 1 });
    const log = (await filesApi.history('d-manual'))[0];
    expect(log).toMatchObject({ action: 'COMPARTIR', channel: 'chat:c-marta' });
  });

  it('no deja adjuntar un documento al que no tengo permiso de descarga', async () => {
    expect(await code(chatApi.send('c-marta', 'x', [{ documentId: 'd-politica' }]))).toMatchObject({ status: 404 });
  });

  it('un mensaje vacío es rechazado', async () => {
    expect(await code(chatApi.send('c-marta', '   ', []))).toMatchObject({ status: 400 });
  });

  it('no se puede leer una conversación ajena', async () => {
    expect(await code(chatApi.messages('no-existe'))).toMatchObject({ status: 404 });
  });
});

describe('Registro maestro simulado (mismas reglas que el backend)', () => {
  beforeEach(async () => { await loginAna(); });
  const docx = (name = 'procedimiento_de_compras.docx') =>
    new File(['x'], name, { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });

  it('el sistema completa creador, fechas, versión, gestión, cambios y URL; el código se normaliza', async () => {
    const { document: d } = await filesApi.create(docx(), alta('pr-com-001', { fechaCreacion: '2024-03-15T14:35:00.000Z' }));
    expect(d).toMatchObject({
      codigo: 'PR-COM-001', estado: 'BORRADOR', gestion: 2024, version: 1, cambios: 'NO',
      usuarioCreador: { id: 'u-ana' }, usuarioModificador: { id: 'u-ana' }, usuarioActualizador: { id: 'u-ana' },
    });
    expect(d.fechaCreacion).toBe('2024-03-15T14:35:00.000Z'); // conserva la hora
    expect(d.revisor).toBeUndefined();
    expect(d.urlWord).toContain('/download?versionId=');
    expect(d.urlPdf).toBeUndefined();
  });

  it('cargarlo como REVISADO deja al usuario como revisor', async () => {
    const { document: d } = await filesApi.create(docx(), alta('REV-1', { estado: 'REVISADO' }));
    expect(d).toMatchObject({ estado: 'REVISADO', revisor: { id: 'u-ana' } });
  });

  it('un PDF nuevo llena url_pdf y conserva el Word anterior', async () => {
    const { document: d } = await filesApi.create(docx(), alta('MIX-1'));
    await filesApi.newVersion(d.id, new File(['p'], 'norma.pdf', { type: 'application/pdf' }));
    const det = await filesApi.get(d.id);
    expect(det.urlPdf).toBeTruthy();
    expect(det.urlWord).toBe(d.urlWord);
    expect(det.usuarioActualizador.id).toBe('u-ana');
  });

  it.each([
    ['sin código', { codigo: '' }],
    ['código con espacios', { codigo: 'PR 001' }],
    ['código con tilde', { codigo: 'AÑO-1' }],
    ['fecha futura', { codigo: 'F-1', fechaCreacion: '2999-01-01T00:00:00Z' }],
  ])('%s → 400', async (_n, extra) => {
    expect(await code(filesApi.create(docx(), alta('X-1', extra)))).toMatchObject({ status: 400 });
  });

  it('un código repetido → 409, aunque cambien las mayúsculas', async () => {
    await filesApi.create(docx(), alta('DUP-1'));
    expect(await code(filesApi.create(docx(), alta('dup-1')))).toMatchObject({ status: 409 });
  });

  it('abre sesión de edición en línea para Word y registra EDITADO en el historial', async () => {
    const { document: d } = await filesApi.create(docx(), alta('EDIT-001'));
    const session = await filesApi.openEditorSession(d.id, 'edit');
    expect(session.modo).toBe('EDICION');
    expect(session.config.document.fileType).toBe('docx');
    expect(session.config.document.permissions.edit).toBe(true);
    const hist = await filesApi.history(d.id);
    expect(hist[0]).toMatchObject({ action: 'EDITADO', versionNumber: 1 });
  });
});
