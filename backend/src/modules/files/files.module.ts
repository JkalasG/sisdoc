import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MulterModule } from '@nestjs/platform-express';
import { AuthModule } from '../auth/auth.public-api';
import { DocumentsApiService } from './application/documents-api.service';
import { DownloadDocumentUseCase } from './application/download-document.use-case';
import { GetHistoryUseCase } from './application/get-history.use-case';
import { OfficeEditorUseCase } from './application/office-editor.use-case';
import { QueryDocumentsUseCase } from './application/query-documents.use-case';
import { ReviewDocumentUseCase } from './application/review-document.use-case';
import { UploadDocumentUseCase } from './application/upload-document.use-case';
import {
  ACCESS_LOG_REPOSITORY, DOCUMENT_REPOSITORY, FILE_STORAGE, OFFICE_EDITOR_PORT, USER_DIRECTORY,
} from './domain/ports';
import { DOCUMENTS_API } from './files.contract';
import { LocalFileStorage } from './infrastructure/local-file-storage';
import { OnlyOfficeAdapter } from './infrastructure/onlyoffice.adapter';
import { PrismaAccessLogRepository } from './infrastructure/prisma-access-log.repository';
import { PrismaDocumentRepository } from './infrastructure/prisma-document.repository';
import { PrismaUserDirectory } from './infrastructure/prisma-user-directory';
import { DocumentsController } from './presentation/documents.controller';
import { OfficeCallbackController } from './presentation/office-callback.controller';

@Module({
  imports: [
    AuthModule, // JwtCookieGuard para proteger las rutas
    // Tope de tamaño aplicado mientras llega el archivo: uno gigante se corta (413) en vez de llenar la memoria del servidor.
    MulterModule.registerAsync({
      inject: [ConfigService],
      useFactory: (c: ConfigService) => ({ limits: { fileSize: Number(c.get('MAX_FILE_SIZE_MB', 50)) * 1024 * 1024, files: 1, fields: 20 } }),
    }),
  ],
  controllers: [DocumentsController, OfficeCallbackController],
  providers: [
    UploadDocumentUseCase, DownloadDocumentUseCase, ReviewDocumentUseCase,
    GetHistoryUseCase, QueryDocumentsUseCase, OfficeEditorUseCase,
    // puertos → adaptadores (aquí, y solo aquí, se decide la tecnología)
    { provide: DOCUMENT_REPOSITORY, useClass: PrismaDocumentRepository },
    { provide: ACCESS_LOG_REPOSITORY, useClass: PrismaAccessLogRepository },
    { provide: FILE_STORAGE, useClass: LocalFileStorage },
    { provide: USER_DIRECTORY, useClass: PrismaUserDirectory },
    { provide: OFFICE_EDITOR_PORT, useClass: OnlyOfficeAdapter },
    // contrato público para otros módulos
    { provide: DOCUMENTS_API, useClass: DocumentsApiService },
  ],
  exports: [DOCUMENTS_API], // solo se exporta la API pública
})
export class FilesModule {}
