import { Inject, Injectable } from '@nestjs/common';
import { ForbiddenError, NotFoundError, ValidationError } from '../../../shared/domain/domain-error';
import {
  assertAccess, claveEdicionColaborativa, debeGuardarCallbackOfimatico, hasPermission, tipoEditorOfimatico,
} from '../domain/document';
import {
  ACCESS_LOG_REPOSITORY, AccessLogRepository, DOCUMENT_REPOSITORY, DocumentRepository,
  FILE_STORAGE, FileStorage, OFFICE_EDITOR_PORT, OfficeEditorPort, USER_DIRECTORY, UserDirectory,
} from '../domain/ports';
import { UploadDocumentUseCase } from './upload-document.use-case';

const FILE_FETCH_TTL_SECONDS = 15 * 60; // 15 min para que OnlyOffice descargue el documento al abrirlo
const CALLBACK_TTL_SECONDS = 12 * 60 * 60; // 12 h de sesión de edición colaborativa

export interface OnlyOfficeCallbackInput {
  status: number;
  key?: string;
  url?: string;
  users?: string[];
  token?: string;
}

@Injectable()
export class OfficeEditorUseCase {
  constructor(
    @Inject(DOCUMENT_REPOSITORY) private readonly docs: DocumentRepository,
    @Inject(ACCESS_LOG_REPOSITORY) private readonly logs: AccessLogRepository,
    @Inject(FILE_STORAGE) private readonly storage: FileStorage,
    @Inject(USER_DIRECTORY) private readonly users: UserDirectory,
    @Inject(OFFICE_EDITOR_PORT) private readonly office: OfficeEditorPort,
    private readonly upload: UploadDocumentUseCase,
  ) {}

  /**
   * Genera la configuración firmada con JWT para abrir el documento en OnlyOffice (modo edición o lectura).
   * Todos los usuarios que abren la misma versión vigente comparten la misma clave colaborativa (`document.key`).
   */
  async openSession(input: {
    documentId: string; userId: string; mode?: 'edit' | 'view'; ip?: string; userAgent?: string;
  }) {
    const doc = await this.docs.findById(input.documentId);
    const share = doc ? await this.docs.getSharePermission(doc.id, input.userId) : null;
    assertAccess(doc, input.userId, share, 'VER'); // 404 si no puede ni verlo

    if (!doc.versionVigenteId) throw new NotFoundError('Versión vigente');
    const version = await this.docs.findVersion(doc.id, doc.versionVigenteId);
    if (!version) throw new NotFoundError('Versión vigente');

    const info = tipoEditorOfimatico(version.mimeType);
    if (!info) {
      throw new ValidationError(`El formato ${version.mimeType} no es compatible con el editor en tiempo real`);
    }

    const tienePermisoEditar = hasPermission(doc, input.userId, share, 'EDITAR');
    if (input.mode === 'edit' && !tienePermisoEditar) {
      throw new ForbiddenError('No tienes permiso de edición sobre este documento');
    }
    if (input.mode === 'edit' && !info.editable) {
      throw new ValidationError('Este tipo de archivo solo admite visualización, no edición en línea');
    }

    const canEdit = input.mode !== 'view' && tienePermisoEditar && info.editable;
    const modo = canEdit ? ('EDICION' as const) : ('LECTURA' as const);

    const fileFetchToken = this.office.signActionToken(
      { purpose: 'file-fetch', documentId: doc.id, versionId: version.id, userId: input.userId },
      FILE_FETCH_TTL_SECONDS,
    );
    const callbackToken = this.office.signActionToken(
      { purpose: 'callback', documentId: doc.id, versionId: version.id, userId: input.userId },
      CALLBACK_TTL_SECONDS,
    );

    const names = await this.users.namesOf([input.userId]);
    const userName = names.get(input.userId) ?? 'Usuario';

    const baseApi = `${this.office.backendInternalUrl}/api/v1`;
    const configPayload = {
      documentType: info.documentType,
      document: {
        fileType: info.fileType,
        key: claveEdicionColaborativa(doc.id, version.id),
        title: version.fileName,
        url: `${baseApi}/documents/${doc.id}/office-content?token=${encodeURIComponent(fileFetchToken)}`,
        permissions: {
          edit: canEdit,
          download: hasPermission(doc, input.userId, share, 'DESCARGAR'),
          print: hasPermission(doc, input.userId, share, 'DESCARGAR'),
          review: canEdit,
          comment: canEdit,
        },
      },
      editorConfig: {
        mode: canEdit ? ('edit' as const) : ('view' as const),
        lang: 'es',
        callbackUrl: `${baseApi}/documents/${doc.id}/office-callback?token=${encodeURIComponent(callbackToken)}`,
        user: { id: input.userId, name: userName },
        customization: {
          autosave: true,
          forcesave: true,
        },
      },
    };

    const token = this.office.signEditorConfig(configPayload);

    await this.logs.append({
      documentId: doc.id,
      versionId: version.id,
      userId: input.userId,
      action: 'VER',
      ip: input.ip,
      userAgent: input.userAgent,
      channel: 'onlyoffice',
      metadata: { modo, versionNumber: version.versionNumber },
    });

    return {
      documentServerUrl: this.office.serverPublicUrl,
      scriptUrl: `${this.office.serverPublicUrl}/web-apps/apps/api/documents/api.js`,
      modo,
      config: { ...configPayload, token },
    };
  }

  /**
   * Entrega el archivo binario directamente al contenedor de OnlyOffice validando el token temporal `file-fetch`.
   */
  async streamForOfficeServer(input: { documentId: string; token?: string }) {
    if (!input.token) throw new ForbiddenError('Falta el token de acceso del servidor ofimático');
    const claims = this.office.verifyActionToken(input.token);
    if (!claims || claims.purpose !== 'file-fetch' || claims.documentId !== input.documentId) {
      throw new ForbiddenError('Token de descarga del editor inválido o expirado');
    }

    const doc = await this.docs.findById(claims.documentId);
    const share = doc ? await this.docs.getSharePermission(doc.id, claims.userId) : null;
    assertAccess(doc, claims.userId, share, 'VER');

    const version = await this.docs.findVersion(doc.id, claims.versionId);
    if (!version) throw new NotFoundError('Versión');

    return {
      stream: await this.storage.read(version.storageKey),
      fileName: version.fileName,
      mimeType: version.mimeType,
      sizeBytes: version.sizeBytes,
    };
  }

  /**
   * Recibe el callback del contenedor OnlyOffice cuando se guarda el documento editado en tiempo real.
   * Descarga el nuevo binario desde OnlyOffice y crea automáticamente la versión N+1 inmutable.
   */
  async handleCallback(input: {
    documentId: string;
    queryToken?: string;
    authHeader?: string;
    body: OnlyOfficeCallbackInput;
    ip?: string;
    userAgent?: string;
  }) {
    if (!input.queryToken) throw new ForbiddenError('Falta el token de callback');
    const claims = this.office.verifyActionToken(input.queryToken);
    if (!claims || claims.purpose !== 'callback' || claims.documentId !== input.documentId) {
      throw new ForbiddenError('Token de callback inválido o expirado');
    }

    const bearer = input.authHeader?.startsWith('Bearer ') ? input.authHeader.slice(7).trim() : undefined;
    const rawJwt = input.body.token ?? bearer;
    if (!rawJwt || !this.office.verifyCallbackJwt(rawJwt)) {
      throw new ForbiddenError('Firma JWT del servidor OnlyOffice inválida');
    }

    // Si el estado es 1 (usuarios conectados) o 4 (cerrado sin cambios), respondemos éxito sin crear versión
    if (!debeGuardarCallbackOfimatico(input.body.status)) {
      return { error: 0 };
    }

    if (!input.body.url) {
      throw new ValidationError('El callback de guardado no incluyó la URL del documento editado');
    }

    const editorUserId = input.body.users?.[0] ?? claims.userId;
    const doc = await this.docs.findById(claims.documentId);
    const share = doc ? await this.docs.getSharePermission(doc.id, editorUserId) : null;
    assertAccess(doc, editorUserId, share, 'EDITAR');

    const baseVersion = await this.docs.findVersion(doc.id, claims.versionId);
    if (!baseVersion) throw new NotFoundError('Versión base');

    const editedBuffer = await this.office.fetchEditedFile(input.body.url);
    const changeNote = input.body.status === 6
      ? 'Guardado en vivo (OnlyOffice)'
      : 'Edición colaborativa en tiempo real (OnlyOffice)';

    const createdVersion = await this.upload.addVersion({
      userId: editorUserId,
      documentId: doc.id,
      file: {
        buffer: editedBuffer,
        originalName: baseVersion.fileName,
        mimeType: baseVersion.mimeType,
      },
      changeNote,
      ip: input.ip,
      userAgent: input.userAgent ?? 'OnlyOffice-DocumentServer',
    });

    return { error: 0, versionId: createdVersion.id, versionNumber: createdVersion.versionNumber };
  }
}

