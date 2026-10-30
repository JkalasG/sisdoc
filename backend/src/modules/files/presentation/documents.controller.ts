import {
  Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query, Req,
  StreamableFile, UploadedFile, UseGuards, UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiConsumes, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { IsDateString, IsIn, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { ValidationError } from '../../../shared/domain/domain-error';
import { AuthUser, CurrentUser } from '../../../shared/presentation/current-user.decorator';
import { JwtCookieGuard } from '../../auth/auth.public-api';
import { DownloadDocumentUseCase } from '../application/download-document.use-case';
import { GetHistoryUseCase } from '../application/get-history.use-case';
import { OfficeEditorUseCase } from '../application/office-editor.use-case';
import { QueryDocumentsUseCase } from '../application/query-documents.use-case';
import { ReviewDocumentUseCase } from '../application/review-document.use-case';
import { UploadDocumentUseCase } from '../application/upload-document.use-case';

/** Lo único que llena la persona al cargar; el resto del registro lo completa el sistema. */
class CreateDocumentDto {
  @IsString() @MaxLength(40) codigo: string;
  @IsOptional() @IsString() @MaxLength(200) nombreDocumento?: string; // por defecto: nombre del archivo
  @IsOptional() @IsString() @MaxLength(2000) descripcion?: string;
  @IsOptional() @IsDateString() fechaCreacion?: string;
  @IsOptional() @IsIn(['BORRADOR', 'REVISADO']) estado?: 'BORRADOR' | 'REVISADO';
}
class NewVersionDto {
  @IsOptional() @IsString() @MaxLength(500) changeNote?: string;
}
class RequestReviewDto {
  @IsUUID() reviewerId: string;
  @IsOptional() @IsUUID() versionId?: string;
}
class DecideReviewDto {
  @IsIn(['APROBADO', 'RECHAZADO', 'CAMBIOS_SOLICITADOS']) decision: 'APROBADO' | 'RECHAZADO' | 'CAMBIOS_SOLICITADOS';
  @IsOptional() @IsString() @MaxLength(2000) comment?: string;
}
class OpenEditorSessionDto {
  @IsOptional() @IsIn(['edit', 'view']) mode?: 'edit' | 'view';
}

const meta = (req: Request) => ({ ip: req.ip, userAgent: req.headers['user-agent'] });
const fileOf = (f: Express.Multer.File) => ({ buffer: f.buffer, originalName: f.originalname, mimeType: f.mimetype });

@ApiTags('documents')
@UseGuards(JwtCookieGuard)
@Controller()
export class DocumentsController {
  constructor(
    private readonly upload: UploadDocumentUseCase,
    private readonly download: DownloadDocumentUseCase,
    private readonly review: ReviewDocumentUseCase,
    private readonly history: GetHistoryUseCase,
    private readonly query: QueryDocumentsUseCase,
    private readonly officeEditor: OfficeEditorUseCase,
  ) {}

  @Get('documents')
  list(@CurrentUser() u: AuthUser) {
    return this.query.list(u.id);
  }

  @Get('directory/users')
  directory(@CurrentUser() u: AuthUser) {
    return this.query.directory(u.id);
  }

  @Get('documents/:id')
  detail(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.query.detail({ documentId: id, userId: u.id });
  }

  @Post('documents')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file'))
  create(@CurrentUser() u: AuthUser, @UploadedFile() file: Express.Multer.File, @Body() dto: CreateDocumentDto, @Req() req: Request) {
    if (!file) throw new ValidationError('Falta el archivo');
    const { fechaCreacion, ...resto } = dto;
    return this.upload.createDocument({
      userId: u.id, file: fileOf(file), ...resto,
      fechaCreacion: fechaCreacion ? new Date(fechaCreacion) : undefined, ...meta(req),
    });
  }

  @Post('documents/:id/versions')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file'))
  newVersion(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @UploadedFile() file: Express.Multer.File, @Body() dto: NewVersionDto, @Req() req: Request) {
    if (!file) throw new ValidationError('Falta el archivo');
    return this.upload.addVersion({ userId: u.id, documentId: id, file: fileOf(file), changeNote: dto.changeNote, ...meta(req) });
  }

  @Get('documents/:id/download')
  async get(
    @CurrentUser() u: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Query('versionId', new ParseUUIDPipe({ optional: true })) versionId: string | undefined,
    @Req() req: Request,
  ) {
    const f = await this.download.execute({ documentId: id, versionId, userId: u.id, ...meta(req) });
    return new StreamableFile(f.stream, {
      type: f.mimeType,
      length: f.sizeBytes,
      disposition: `attachment; filename*=UTF-8''${encodeURIComponent(f.fileName)}`,
    });
  }

  @Get('documents/:id/history')
  getHistory(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Query('cursor') cursor?: string) {
    return this.history.execute({ documentId: id, userId: u.id, cursor });
  }

  @Post('documents/:id/reviews')
  requestReview(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: RequestReviewDto) {
    return this.review.request({ documentId: id, userId: u.id, ...dto });
  }

  @Patch('reviews/:reviewId')
  decide(@CurrentUser() u: AuthUser, @Param('reviewId', ParseUUIDPipe) reviewId: string, @Body() dto: DecideReviewDto) {
    return this.review.decide({ reviewId, userId: u.id, ...dto });
  }

  /** Inicia o une al usuario a una sesión de edición colaborativa en tiempo real (OnlyOffice). */
  @Post('documents/:id/editor-session')
  openEditorSession(
    @CurrentUser() u: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: OpenEditorSessionDto,
    @Req() req: Request,
  ) {
    return this.officeEditor.openSession({ documentId: id, userId: u.id, mode: dto.mode, ...meta(req) });
  }
}
