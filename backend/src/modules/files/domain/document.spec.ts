import {
  assertAccess, claveEdicionColaborativa, debeGuardarCallbackOfimatico, Document, gestionDe,
  nombreDesdeArchivo, normalizarCodigo, normalizarFechaCreacion, normalizarNombre,
  statusAfterDecision, tipoEditorOfimatico, tipoUrl, urlDescarga,
} from './document';

const doc = (over: Partial<Document> = {}): Document => ({
  id: 'd1', codigo: 'X-1', nombreDocumento: 'X', estado: 'BORRADOR', gestion: 2026, cambios: 'NO', version: 1,
  fechaCreacion: new Date(), usuarioCreadorId: 'ana', fechaModificacion: new Date(), usuarioModificadorId: 'ana',
  fechaActualizacion: new Date(), usuarioActualizadorId: 'ana', eliminado: false, ...over,
});

describe('Código del documento', () => {
  it('se recorta y se pasa a mayúsculas', () => expect(normalizarCodigo('  pr-com/001 ')).toBe('PR-COM/001'));
  it.each(['', 'A', 'PR 001', 'AÑO-1', 'ÁREA-1', '-X1', 'a'.repeat(41)])('rechaza "%s"', (c) => {
    expect(() => normalizarCodigo(c)).toThrow();
  });
});

describe('Nombre del documento', () => {
  it('por defecto sale del nombre del archivo, sin extensión', () => {
    expect(nombreDesdeArchivo('procedimiento_de_compras.v2.docx')).toBe('procedimiento de compras.v2');
    expect(nombreDesdeArchivo('Manual.pdf')).toBe('Manual');
  });
  it('si el usuario lo cambia, se respeta; si lo deja vacío, vuelve al del archivo', () => {
    expect(normalizarNombre('  Manual de calidad ', 'x.pdf')).toBe('Manual de calidad');
    expect(normalizarNombre('   ', 'manual.pdf')).toBe('manual');
    expect(normalizarNombre(undefined, 'manual.pdf')).toBe('manual');
  });
  it('no admite más de 200 caracteres', () => expect(() => normalizarNombre('a'.repeat(201), 'x.pdf')).toThrow());
});

describe('Fecha y hora de creación y gestión', () => {
  const hoy = new Date('2026-10-31T12:00:00Z');
  it('por defecto es ahora', () => expect(normalizarFechaCreacion(undefined, hoy)).toBe(hoy));
  it('conserva la hora y admite fechas pasadas', () => {
    const f = normalizarFechaCreacion(new Date('2024-03-15T14:35:00Z'), hoy);
    expect(f.toISOString()).toBe('2024-03-15T14:35:00.000Z');
    expect(gestionDe(f)).toBe(2024);
  });
  it('la gestión usa la zona horaria de la organización, no UTC', () => {
    // 31/dic 22:00 en La Paz (UTC-4) ya es 1/ene 02:00 en UTC
    const f = new Date('2027-01-01T02:00:00Z');
    expect(gestionDe(f, 'America/La_Paz')).toBe(2026);
    expect(gestionDe(f, 'UTC')).toBe(2027);
  });
  it('rechaza fechas futuras (con 5 min de tolerancia) e inválidas', () => {
    expect(() => normalizarFechaCreacion(new Date('2026-10-31T12:03:00Z'), hoy)).not.toThrow();
    expect(() => normalizarFechaCreacion(new Date('2026-10-31T12:10:00Z'), hoy)).toThrow();
    expect(() => normalizarFechaCreacion(new Date('nada'), hoy)).toThrow();
  });
});

describe('URL de Word / PDF', () => {
  it('clasifica por tipo de archivo', () => {
    expect(tipoUrl('application/vnd.openxmlformats-officedocument.wordprocessingml.document')).toBe('word');
    expect(tipoUrl('application/msword')).toBe('word');
    expect(tipoUrl('application/pdf')).toBe('pdf');
    expect(tipoUrl('image/png')).toBeNull();
  });
  it('la URL apunta a la descarga del backend (queda registrada)', () => {
    expect(urlDescarga('d1', 'v1')).toBe('/documents/d1/download?versionId=v1');
  });
});

describe('Acceso y estados', () => {
  it('el creador puede todo; un tercero no ve el documento (404)', () => {
    expect(() => assertAccess(doc(), 'ana', null, 'EDITAR')).not.toThrow();
    expect(() => assertAccess(doc(), 'luis', null, 'VER')).toThrow(/no encontrado/);
  });
  it('con VER pero sin DESCARGAR es 403, no 404', () => {
    expect(() => assertAccess(doc(), 'luis', 'VER', 'DESCARGAR')).toThrow(/permiso/);
  });
  it('un documento eliminado no existe para nadie', () => {
    expect(() => assertAccess(doc({ eliminado: true }), 'ana', null, 'VER')).toThrow(/no encontrado/);
  });
  it('la decisión de la revisión mueve el estado', () => {
    expect(statusAfterDecision('APROBADO')).toBe('APROBADO');
    expect(statusAfterDecision('RECHAZADO')).toBe('RECHAZADO');
    expect(statusAfterDecision('CAMBIOS_SOLICITADOS')).toBe('BORRADOR');
  });
});

describe('Edición en tiempo real (OnlyOffice)', () => {
  it('clasifica Word (.docx), Excel y PowerPoint como editables y PDF como lectura', () => {
    expect(tipoEditorOfimatico('application/vnd.openxmlformats-officedocument.wordprocessingml.document'))
      .toEqual({ documentType: 'word', fileType: 'docx', editable: true });
    expect(tipoEditorOfimatico('application/pdf'))
      .toEqual({ documentType: 'word', fileType: 'pdf', editable: false });
    expect(tipoEditorOfimatico('image/png')).toBeNull();
  });

  it('genera una clave colaborativa limpia por documento y versión', () => {
    expect(claveEdicionColaborativa('doc-123', 'ver-456')).toBe('doc-123_ver-456');
  });

  it('solo guarda cuando el callback de OnlyOffice indica estado 2 (cerrado con cambios) o 6 (forcesave)', () => {
    expect(debeGuardarCallbackOfimatico(1)).toBe(false);
    expect(debeGuardarCallbackOfimatico(2)).toBe(true);
    expect(debeGuardarCallbackOfimatico(4)).toBe(false);
    expect(debeGuardarCallbackOfimatico(6)).toBe(true);
  });
});
