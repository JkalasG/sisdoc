import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../shared/infrastructure/prisma/prisma.service';
import { UserDirectory } from '../domain/ports';

/**
 * Adaptador de solo lectura: resuelve nombres para mostrar.
 * TODO: cuando exista el módulo de usuarios, consumir su API pública en lugar de leer la tabla.
 */
@Injectable()
export class PrismaUserDirectory implements UserDirectory {
  constructor(private readonly prisma: PrismaService) {}

  async namesOf(ids: string[]) {
    const unique = [...new Set(ids)];
    const rows = unique.length
      ? await this.prisma.user.findMany({ where: { id: { in: unique } }, select: { id: true, displayName: true } })
      : [];
    return new Map(rows.map((u) => [u.id, u.displayName]));
  }

  async listActiveUsers(excludeUserId?: string) {
    const rows = await this.prisma.user.findMany({
      where: { status: 'ACTIVE', ...(excludeUserId ? { id: { not: excludeUserId } } : {}) },
      select: { id: true, displayName: true, email: true },
      orderBy: { displayName: 'asc' },
    });
    return rows.map((u) => ({ id: u.id, name: u.displayName, email: u.email }));
  }
}
