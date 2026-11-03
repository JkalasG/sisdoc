import { createHash, randomUUID } from 'crypto';
import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ConflictError, ValidationError } from '../../../shared/domain/domain-error';
import {
  assertAccess, EstadoInicial, TipoCambioVersion, gestionDe, ZONA_HORARIA_POR_DEFECTO, normalizarCodigo, normalizarFechaCreacion, normalizarNombre, resolverMime,
} from '../domain/document';
import {
  ACCESS_LOG_REPOSITORY, AccessLogRepository, DOCUMENT_REPOSITORY, DocumentRepository,
  FILE_STORAGE, FileStorage, NewVersion,
} from '../domain/ports';

export interface UploadInput {
  userId: string;
  file: { buffer: Buffer; originalName: string; mimeType: string };
  ip?: string;
  userAgent?: string;
}

const ALLOWED_MIME = new Set([
  'application/pdf', 'image/png', 'image/jpeg',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/plain',
]);

@Injectable()
export class UploadDocumentUseCase {
  constructor(
    @Inject(DOCUMENT_REPOSITORY) private readonly docs: DocumentRepository,
    @Inject(ACCESS_LOG_REPOSITORY) private readonly logs: AccessLogRepository,
    @Inject(FILE_STORAGE) private readonly storage: FileStorage,
    private readonly config: ConfigService,
  ) {}

  private async store(input: UploadInput, folder: string): Promise<NewVersion> {
    const file = { ...input.file, mimeType: resolverMime(input.file.originalName, input.file.mimeType) };
    const maxBytes = Number(this.config.get('MAX_FILE_SIZE_MB', 50)) * 1024 * 1024;
    if (file.buffer.length === 0) throw new ValidationError('El archivo está vacío');
    if (file.buffer.length > maxBytes) throw new ValidationError('El archivo supera el tamaño máximo');
    if (!ALLOWED_MIME.has(file.mimeType)) throw new ValidationError(`Tipo de archivo no permitido: ${file.mimeType}`);

    const storageKey = `documents/${folder}/${randomUUID()}`; // nunca el nombre original
    await this.storage.put(storageKey, file.buffer, file.mimeType);

    return {
      storageKey,
      fileName: file.originalName,
      mimeType: file.mimeType,
      sizeBytes: file.buffer.length,
      checksumSha256: createHash('sha256').update(file.buffer).digest('hex'),
      uploadedById: input.userId,
    };
  }

  /**
   * Documento nuevo → versión 1.
   * El formulario aporta código, nombre, fecha de creación y borrador/revisado; el resto lo llena el sistema.
   */
  async createDocument(input: UploadInput & {
    codigo: string; nombreDocumento?: string; descripcion?: string; fechaCreacion?: Date; estado?: EstadoInicial;
  }) {
    const ahora = new Date();
    const codigo = normalizarCodigo(input.codigo);
    const nombreDocumento = normalizarNombre(input.nombreDocumento, input.file.originalName);
    const fechaCreacion = normalizarFechaCreacion(input.fechaCreacion, ahora);
    const estado: EstadoInicial = input.estado ?? 'BORRADOR';
    if (estado !== 'BORRADOR' && estado !== 'REVISADO') throw new ValidationError('El estado inicial debe ser borrador o revisado');
    // se valida ANTES de guardar el archivo, para no dejar archivos huérfanos
    if (await this.docs.findByCodigo(codigo)) throw new ConflictError(`Ya existe un documento con el código ${codigo}`);

    const version = await this.store(input, randomUUID());
    const { document, version: v1 } = await this.docs.createWithFirstVersion({
      codigo, nombreDocumento, descripcion: input.descripcion, estado, fechaCreacion,
      gestion: gestionDe(fechaCreacion, this.config.get<string>('APP_TIMEZONE', ZONA_HORARIA_POR_DEFECTO)), usuarioId: input.userId,
      revisorId: estado === 'REVISADO' ? input.userId : undefined, // quien lo carga como revisado, lo respalda
      version,
    });
    await this.logs.append({
      documentId: document.id, versionId: v1.id, userId: input.userId, action: 'SUBIR',
      ip: input.ip, userAgent: input.userAgent, channel: 'archivos',
      metadata: { codigo, estado, checksum: v1.checksumSha256, size: v1.sizeBytes },
    });
    return { document, version: v1 };
  }

  /**
   * Nueva revisión de un documento existente (la anterior se conserva intacta).
   * MAYOR (por defecto, archivo subido) → 2.0, 3.0…  ·  MENOR (edición en línea) → 1.1, 1.2…
   */
  async addVersion(input: UploadInput & { documentId: string; changeNote?: string; cambio?: TipoCambioVersion }) {
    const doc = await this.docs.findById(input.documentId);
    const share = doc ? await this.docs.getSharePermission(doc.id, input.userId) : null;
    assertAccess(doc, input.userId, share, 'EDITAR');

    const version = { ...(await this.store(input, doc.id)), changeNote: input.changeNote };
    const created = await this.docs.addVersion(doc.id, version, input.cambio ?? 'MAYOR');
    await this.logs.append({
      documentId: doc.id, versionId: created.id, userId: input.userId, action: 'NUEVA_VERSION',
      ip: input.ip, userAgent: input.userAgent, channel: 'archivos',
      metadata: { versionNumber: created.versionNumber, versionMenor: created.versionMenor, checksum: created.checksumSha256 },
    });
    return created;
  }
}
