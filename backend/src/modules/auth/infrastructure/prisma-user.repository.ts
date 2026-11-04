import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../shared/infrastructure/prisma/prisma.service';
import { UserRepository } from '../application/ports';

@Injectable()
export class PrismaUserRepository implements UserRepository {
  constructor(private readonly prisma: PrismaService) {}

  findByEmail(email: string) {
    return this.prisma.user.findUnique({ where: { email } });
  }

  findById(id: string) {
    return this.prisma.user.findUnique({ where: { id } });
  }

  findByGoogleSub(sub: string) {
    return this.prisma.user.findUnique({ where: { googleSub: sub } });
  }

  async createPendingFromGoogle(i: { email: string; displayName: string; googleSub: string }) {
    try {
      return await this.prisma.user.create({
        data: {
          email: i.email, displayName: i.displayName, googleSub: i.googleSub, passwordHash: null,
          status: 'PENDING', roles: ['USUARIO'], mustChangePassword: false, // no tiene contraseña que cambiar
        },
      });
    } catch (e) {
      // Dos primeros ingresos simultáneos: gana uno y el otro usa la cuenta ya creada.
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        const existing = await this.prisma.user.findUnique({ where: { email: i.email } });
        if (existing) return existing;
      }
      throw e;
    }
  }

  async linkGoogle(id: string, sub: string) {
    await this.prisma.user.updateMany({ where: { id, googleSub: null }, data: { googleSub: sub } });
  }

  async saveLoginState(
    id: string,
    s: { failedAttempts: number; lockoutLevel: number; lockedUntil: Date | null; lastLoginAt?: Date },
  ) {
    await this.prisma.user.update({ where: { id }, data: s });
  }

  async changePassword(id: string, passwordHash: string, at: Date) {
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id },
        data: {
          passwordHash, mustChangePassword: false, passwordChangedAt: at,
          failedAttempts: 0, lockoutLevel: 0, lockedUntil: null,
        },
      }),
      this.prisma.passwordHistory.create({ data: { userId: id, passwordHash } }),
    ]);
  }

  async getPasswordHistory(id: string, limit: number) {
    const rows = await this.prisma.passwordHistory.findMany({
      where: { userId: id }, orderBy: { createdAt: 'desc' }, take: limit, select: { passwordHash: true },
    });
    return rows.map((r) => r.passwordHash);
  }
}
