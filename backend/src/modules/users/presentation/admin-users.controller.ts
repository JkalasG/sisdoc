import {
  Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Put, Query, Req, UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ArrayMaxSize, IsArray, IsEmail, IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { Request } from 'express';
import { clientIp } from '../../../shared/presentation/client-ip';
import { AuthUser, CurrentUser } from '../../../shared/presentation/current-user.decorator';
import { JwtCookieGuard } from '../../auth/auth.public-api';
import { ManageUsersUseCase } from '../application/manage-users.use-case';
import { Account, ROLES } from '../domain/user-account';

class CreateUserDto {
  @IsEmail() @MaxLength(254) email: string;
  @IsString() @MinLength(2) @MaxLength(120) displayName: string;
  @IsOptional() @IsArray() @ArrayMaxSize(ROLES.length) @IsIn(ROLES, { each: true }) roles?: string[];
}
class RolesDto {
  @IsArray() @ArrayMaxSize(ROLES.length) @IsIn(ROLES, { each: true }) roles: string[];
}
class ListQuery {
  @IsOptional() @IsString() @MaxLength(100) q?: string;
  @IsOptional() @IsIn(['ACTIVE', 'DISABLED']) status?: 'ACTIVE' | 'DISABLED';
}

const meta = (req: Request) => ({ ip: clientIp(req), userAgent: req.headers['user-agent'] });

/** Lo que ve el administrador de cada cuenta (nunca hashes ni contadores internos de intentos). */
const view = (a: Account) => ({
  id: a.id, email: a.email, displayName: a.displayName, status: a.status, roles: a.roles,
  mustChangePassword: a.mustChangePassword, locked: a.lockedUntil !== null && a.lockedUntil.getTime() > Date.now(),
  lockedUntil: a.lockedUntil?.toISOString() ?? null, lastLoginAt: a.lastLoginAt?.toISOString() ?? null,
  createdAt: a.createdAt.toISOString(), liveSessions: a.liveSessions,
});

/** Gestión de usuarios para administradores (rol ADMIN). */
@ApiTags('admin')
@Controller('admin/users')
@UseGuards(JwtCookieGuard)
export class AdminUsersController {
  constructor(private readonly manage: ManageUsersUseCase) {}

  private ctx(u: AuthUser, req: Request) { return { actorId: u.id, ...meta(req) }; }

  @Get()
  async list(@CurrentUser() u: AuthUser, @Query() q: ListQuery) {
    return (await this.manage.list(u.id, q)).map(view);
  }

  @Post()
  async create(@CurrentUser() u: AuthUser, @Body() dto: CreateUserDto, @Req() req: Request) {
    const r = await this.manage.create(this.ctx(u, req), dto);
    return { user: view(r.user), temporaryPassword: r.temporaryPassword };
  }

  @Post(':id/disable') @HttpCode(200)
  async disable(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Req() req: Request) {
    return view(await this.manage.disable(this.ctx(u, req), id));
  }

  @Post(':id/enable') @HttpCode(200)
  async enable(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Req() req: Request) {
    return view(await this.manage.enable(this.ctx(u, req), id));
  }

  @Post(':id/unlock') @HttpCode(200)
  async unlock(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Req() req: Request) {
    return view(await this.manage.unlock(this.ctx(u, req), id));
  }

  @Post(':id/reset-password') @HttpCode(200)
  async reset(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Req() req: Request) {
    const r = await this.manage.resetPassword(this.ctx(u, req), id);
    return { user: view(r.user), temporaryPassword: r.temporaryPassword };
  }

  @Put(':id/roles')
  async roles(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: RolesDto, @Req() req: Request) {
    return view(await this.manage.setRoles(this.ctx(u, req), id, dto.roles));
  }
}
