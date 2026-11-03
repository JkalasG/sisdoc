import { Controller, Get, HttpCode, Param, Post, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { AuthUser, CurrentUser } from '../../../shared/presentation/current-user.decorator';
import { ManageDevicesUseCase } from '../application/manage-devices.use-case';
import { JwtCookieGuard } from './jwt-cookie.guard';

/** Gestión de dispositivos para administradores (rol ADMIN). */
@ApiTags('admin')
@Controller('admin/devices')
@UseGuards(JwtCookieGuard)
export class AdminDevicesController {
  constructor(private readonly manage: ManageDevicesUseCase) {}

  @Get()
  list(@CurrentUser() u: AuthUser) {
    return this.manage.list(u.id);
  }

  @Post(':id/approve')
  @HttpCode(204)
  approve(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    return this.manage.decide(u.id, id, 'TRUSTED');
  }

  @Post(':id/block')
  @HttpCode(204)
  block(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    return this.manage.decide(u.id, id, 'BLOCKED');
  }
}
