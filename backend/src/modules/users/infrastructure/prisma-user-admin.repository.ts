import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ConflictError } from '../../../shared/domain/domain-error';
import { PrismaService } from '../../../shared/infrastructure/prisma/prisma.service';
import { Account, AccountStatus } from '../domain/user-account';
import { UserAdminRepository } from '../application/ports';

type Row = Prisma.UserGetPayload<{ include: { _count: { select: { sessions: true } } } }>;

const toAccount = (u: Row): Account => ({
  id: u.id, email: u.email, displayName: u.displayName, status: u.status, roles: u.roles,
  mustChangePassword: u.mustChangePassword, lockedUntil: u.lockedUntil, lastLoginAt: u.lastLoginAt,
  createdAt: u.createdAt, liveSessions: u._count.sessions,
});

@Injectable()
export class PrismaUserAdminRepository implements UserAdminRepository {
  constructor(private readonly prisma: PrismaService) {}

  private include(now: Date, inactiveBefore: Date) {
    return {
      _count: { select: { sessions: { where: { revokedAt: null, absoluteExpiresAt: { gt: now }, lastActivityAt: { gt: inactiveBefore } } } } },
    } satisfies Prisma.UserInclude;
  }

  async findActor(id: string) {
    const u = await this.prisma.user.findUnique({ where: { id }, select: { id: true, roles: true, status: true } });
    return u ? { id: u.id, roles: u.roles, status: u.status } : null;
  }

  async list(filter: { q?: string; status?: AccountStatus }, now: Date, inactiveBefore: Date) {
    const where: Prisma.UserWhereInput = {
      ...(filter.status ? { status: filter.status } : {}),
      ...(filter.q
        ? { OR: [{ email: { contains: filter.q, mode: 'insensitive' } }, { displayName: { contains: filter.q, mode: 'insensitive' } }] }
        : {}),
    };
    const rows = await this.prisma.user.findMany({
      where, include: this.include(now, inactiveBefore), orderBy: { createdAt: 'desc' }, take: 500,
    });
    return rows.map(toAccount);
  }

  async findById(id: string, now: Date, inactiveBefore: Date) {
    const u = await this.prisma.user.findUnique({ where: { id }, include: this.include(now, inactiveBefore) });
    return u ? toAccount(u) : null;
  }

  async emailExists(email: string) {
    return (await this.prisma.user.count({ where: { email } })) > 0;
  }

  countActiveAdmins() {
    return this.prisma.user.count({ where: { status: 'ACTIVE', roles: { has: 'ADMIN' } } });
  }

  async create(i: { email: string; displayName: string; roles: string[]; passwordHash: string; createdById: string }) {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const u = await tx.user.create({
          data: {
            email: i.email, displayName: i.displayName, roles: i.roles, passwordHash: i.passwordHash,
            mustChangePassword: true, createdById: i.createdById,
          },
        });
        await tx.passwordHistory.create({ data: { userId: u.id, passwordHash: i.passwordHash } });
        return u.id;
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new ConflictError('Ya existe un usuario con ese correo');
      }
      throw e;
    }
  }

  async setStatus(id: string, status: AccountStatus) {
    await this.prisma.user.update({ where: { id }, data: { status } });
  }

  async setRoles(id: string, roles: string[]) {
    await this.prisma.user.update({ where: { id }, data: { roles } });
  }

  async unlock(id: string) {
    await this.prisma.user.update({ where: { id }, data: { failedAttempts: 0, lockoutLevel: 0, lockedUntil: null } });
  }

  async resetPassword(id: string, passwordHash: string, at: Date) {
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id },
        data: { passwordHash, mustChangePassword: true, passwordChangedAt: at, failedAttempts: 0, lockoutLevel: 0, lockedUntil: null },
      }),
      this.prisma.passwordHistory.create({ data: { userId: id, passwordHash } }),
    ]);
  }

  async revokeSessions(userId: string, reason: 'ADMIN' | 'USER_DISABLED', at: Date) {
    await this.prisma.session.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: at, revokedReason: reason } });
  }
}
