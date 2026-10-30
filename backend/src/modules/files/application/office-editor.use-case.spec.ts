import { Readable } from 'stream';
import { ConfigService } from '@nestjs/config';
import { ForbiddenError, NotFoundError, ValidationError } from '../../../shared/domain/domain-error';
import { AccessLogEntry, Document, DocumentVersion, SharePermission } from '../domain/document';
import {
  AccessLogRepository, DocumentRepository, FileStorage, NewDocument, NewVersion, OfficeEditorPort,
  OfficeTokenClaims, UserDirectory,
} from '../domain/ports';
import { OnlyOfficeAdapter } from '../infrastructure/onlyoffice.adapter';
import { OfficeEditorUseCase } from './office-editor.use-case';
import { UploadDocumentUseCase } from './upload-document.use-case';

const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

class InMemoryFileStorage implements FileStorage {
  files = new Map<string, Buffer>();
  async put(key: string, body: Buffer) {
    this.files.set(key, body);
  }
  async read(key: string) {
    return Readable.from(this.files.get(key) ?? Buffer.from('contenido inicial word'));
  }
}

class InMemoryAccessLogs implements AccessLogRepository {
  entries: AccessLogEntry[] = [];
  async append(e: AccessLogEntry) {
    this.entries.push(e);
  }
  async listByDocument() {
    return [];
  }
}

class InMemoryUserDirectory implements UserDirectory {
  async namesOf(ids: string[]) {
    return new Map(ids.map((id) => [id, `Nombre de ${id}`]));
  }
}

class InMemoryDocuments implements DocumentRepository {
  doc: Document = {
    id: 'doc-1',
    codigo: 'INF-2026-01',
    nombreDocumento: 'Informe Técnico',
    estado: 'BORRADOR',
    gestion: 2026,
    cambios: 'NO',
    version: 1,
    fechaCreacion: new Date('2026-10-30T10:00:00Z'),
    usuarioCreadorId: 'ana',
    fechaModificacion: new Date('2026-10-30T10:00:00Z'),
    usuarioModificadorId: 'ana',
    fechaActualizacion: new Date('2026-10-30T10:00:00Z'),
    usuarioActualizadorId: 'ana',
    versionVigenteId: 'ver-1',
    eliminado: false,
  };
  versions: DocumentVersion[] = [
    {
      id: 'ver-1',
      documentId: 'doc-1',
      versionNumber: 1,
      storageKey: 'documents/doc-1/v1',
      fileName: 'informe.docx',
      mimeType: DOCX_MIME,
      sizeBytes: 25,
      checksumSha256: 'sha-v1',
      uploadedById: 'ana',
      createdAt: new Date('2026-10-30T10:00:00Z'),
    },
  ];
  shares = new Map<string, SharePermission>();

  async createWithFirstVersion(_i: NewDocument): Promise<{ document: Document; version: DocumentVersion }> {
    throw new Error('no usado');
  }
  async addVersion(documentId: string, v: NewVersion): Promise<DocumentVersion> {
    const next: DocumentVersion = {
      ...v,
      id: `ver-${this.versions.length + 1}`,
      documentId,
      versionNumber: this.versions.length + 1,
      createdAt: new Date(),
    };
    this.versions.push(next);
    this.doc.versionVigenteId = next.id;
    this.doc.version = next.versionNumber;
    this.doc.cambios = 'SI';
    return next;
  }
  async findById(id: string) { return id === this.doc.id ? this.doc : null; }
  async findByCodigo() { return null; }
  async findVersion(documentId: string, versionId: string) {
    return this.versions.find((v) => v.documentId === documentId && v.id === versionId) ?? null;
  }
  async listVersions() { return this.versions; }
  async listReviews() { return []; }
  async listVisible() { return []; }
  async getSharePermission(_docId: string, userId: string) { return this.shares.get(userId) ?? null; }
  async upsertShare() {}
  async setStatus() {}
  async createReview(): Promise<never> { throw new Error('no usado'); }
  async findReview() { return null; }
  async decideReview() {}
}

class FakeOfficeAdapter extends OnlyOfficeAdapter implements OfficeEditorPort {
  constructor() {
    super(
      new ConfigService({
        ONLYOFFICE_PUBLIC_URL: 'http://localhost:8082',
        ONLYOFFICE_INTERNAL_URL: 'http://onlyoffice:80',
        ONLYOFFICE_JWT_SECRET: 'secreto-onlyoffice-pruebas-2026-seguro',
        BACKEND_INTERNAL_URL: 'http://host.docker.internal:3000',
      }),
    );
  }
  override async fetchEditedFile(downloadUrl: string): Promise<Buffer> {
    if (!downloadUrl.startsWith('http://onlyoffice:80/') && !downloadUrl.startsWith('http://localhost:8082/')) {
      throw new ForbiddenError('URL de descarga del servidor ofimático no autorizada');
    }
    return Buffer.from('contenido word editado en tiempo real v2');
  }
}

function buildEditorWorld() {
  const docs = new InMemoryDocuments();
  const logs = new InMemoryAccessLogs();
  const storage = new InMemoryFileStorage();
  const users = new InMemoryUserDirectory();
  const office = new FakeOfficeAdapter();
  const config = new ConfigService({ MAX_FILE_SIZE_MB: 50 });
  const upload = new UploadDocumentUseCase(docs, logs, storage, config);
  const editor = new OfficeEditorUseCase(docs, logs, storage, users, office, upload);
  return { docs, logs, storage, users, office, upload, editor };
}

describe('OfficeEditorUseCase (Edición en tiempo real con OnlyOffice)', () => {
  it('abre sesión en modo EDICION para la creadora del Word y firma el config con JWT', async () => {
    const { editor, logs } = buildEditorWorld();
    const session = await editor.openSession({ documentId: 'doc-1', userId: 'ana', ip: '10.0.0.1' });

    expect(session.modo).toBe('EDICION');
    expect(session.scriptUrl).toBe('http://localhost:8082/web-apps/apps/api/documents/api.js');
    expect(session.config.token).toEqual(expect.any(String));
    expect(session.config.document.key).toBe('doc-1_ver-1');
    expect(logs.entries).toHaveLength(1);
    expect(logs.entries[0]).toMatchObject({ action: 'VER', channel: 'onlyoffice', userId: 'ana' });
  });

  it('un usuario con permiso VER abre en modo LECTURA y recibe 403 si fuerza mode="edit"', async () => {
    const { editor, docs } = buildEditorWorld();
    docs.shares.set('luis', 'VER');

    const lectura = await editor.openSession({ documentId: 'doc-1', userId: 'luis' });
    expect(lectura.modo).toBe('LECTURA');

    await expect(editor.openSession({ documentId: 'doc-1', userId: 'luis', mode: 'edit' }))
      .rejects.toBeInstanceOf(ForbiddenError);
  });

  it('un usuario ajeno sin permiso recibe 404 (lo ajeno no existe)', async () => {
    const { editor } = buildEditorWorld();
    await expect(editor.openSession({ documentId: 'doc-1', userId: 'intruso' }))
      .rejects.toBeInstanceOf(NotFoundError);
  });

  it('permite a OnlyOffice descargar el binario con el token file-fetch y rechaza tokens de otro propósito', async () => {
    const { editor, office } = buildEditorWorld();
    const validToken = office.signActionToken(
      { purpose: 'file-fetch', documentId: 'doc-1', versionId: 'ver-1', userId: 'ana' },
      300,
    );
    const res = await editor.streamForOfficeServer({ documentId: 'doc-1', token: validToken });
    expect(res.fileName).toBe('informe.docx');

    const wrongPurpose: OfficeTokenClaims = { purpose: 'callback', documentId: 'doc-1', versionId: 'ver-1', userId: 'ana' };
    const badToken = office.signActionToken(wrongPurpose, 300);
    await expect(editor.streamForOfficeServer({ documentId: 'doc-1', token: badToken }))
      .rejects.toBeInstanceOf(ForbiddenError);
  });

  it('al recibir callback status=2 de OnlyOffice, descarga el Word editado y crea la Versión 2 inmutable', async () => {
    const { editor, office, docs, logs } = buildEditorWorld();
    const callbackToken = office.signActionToken(
      { purpose: 'callback', documentId: 'doc-1', versionId: 'ver-1', userId: 'ana' },
      3600,
    );
    const bodyJwt = office.signEditorConfig({ status: 2, url: 'http://onlyoffice:80/cache/edited.docx' });

    const r = await editor.handleCallback({
      documentId: 'doc-1',
      queryToken: callbackToken,
      body: {
        status: 2,
        url: 'http://onlyoffice:80/cache/edited.docx',
        users: ['ana'],
        token: bodyJwt,
      },
    });

    expect(r).toEqual({ error: 0, versionId: 'ver-2', versionNumber: 2 });
    expect(docs.doc.version).toBe(2);
    expect(docs.doc.cambios).toBe('SI');
    expect(docs.versions).toHaveLength(2);
    expect(logs.entries.some((e) => e.action === 'NUEVA_VERSION')).toBe(true);
  });

  it('bloquea intentos de SSRF si la URL del callback no pertenece al contenedor OnlyOffice', async () => {
    const { editor, office } = buildEditorWorld();
    const callbackToken = office.signActionToken(
      { purpose: 'callback', documentId: 'doc-1', versionId: 'ver-1', userId: 'ana' },
      3600,
    );
    const bodyJwt = office.signEditorConfig({ status: 2 });

    await expect(
      editor.handleCallback({
        documentId: 'doc-1',
        queryToken: callbackToken,
        body: {
          status: 2,
          url: 'http://169.254.169.254/latest/meta-data',
          users: ['ana'],
          token: bodyJwt,
        },
      }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('rechaza si el documento no es compatible con edición ofimática (p. ej. imagen PNG)', async () => {
    const { editor, docs } = buildEditorWorld();
    docs.versions[0].mimeType = 'image/png';
    await expect(editor.openSession({ documentId: 'doc-1', userId: 'ana' }))
      .rejects.toBeInstanceOf(ValidationError);
  });
});

