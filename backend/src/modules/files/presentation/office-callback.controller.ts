import {
  Body, Controller, Get, Headers, HttpCode, Param, ParseUUIDPipe, Post, Query, Req, StreamableFile,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { IsArray, IsInt, IsOptional, IsString, MaxLength } from 'class-validator';
import { Request } from 'express';
import { OfficeEditorUseCase } from '../application/office-editor.use-case';

class OnlyOfficeCallbackDto {
  @IsInt() status: number;
  @IsOptional() @IsString() @MaxLength(200) key?: string;
  @IsOptional() @IsString() @MaxLength(2000) url?: string;
  @IsOptional() @IsArray() @IsString({ each: true }) users?: string[];
  @IsOptional() @IsString() @MaxLength(8000) token?: string;
}

/**
 * Endpoints servidor-a-servidor consumidos por el contenedor de OnlyOffice Document Server.
 * No usan cookies de navegador; exigen tokens criptográficos firmados (HS256) de corta duración.
 */
@ApiTags('documents-office')
@Controller()
export class OfficeCallbackController {
  constructor(private readonly officeEditor: OfficeEditorUseCase) {}

  /** OnlyOffice descarga desde aquí el binario inicial para abrir la sesión de edición en vivo. */
  @Get('documents/:id/office-content')
  async getOfficeContent(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('token') token?: string,
  ) {
    const f = await this.officeEditor.streamForOfficeServer({ documentId: id, token });
    return new StreamableFile(f.stream, {
      type: f.mimeType,
      length: f.sizeBytes,
      disposition: `attachment; filename*=UTF-8''${encodeURIComponent(f.fileName)}`,
    });
  }

  /** OnlyOffice envía aquí el archivo modificado para guardarlo como nueva versión inmutable (v2, v3...). */
  @Post('documents/:id/office-callback')
  @HttpCode(200)
  handleOfficeCallback(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('token') queryToken: string | undefined,
    @Headers('authorization') authHeader: string | undefined,
    @Body() dto: OnlyOfficeCallbackDto,
    @Req() req: Request,
  ) {
    return this.officeEditor.handleCallback({
      documentId: id,
      queryToken,
      authHeader,
      body: dto,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
  }
}

