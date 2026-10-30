import { Injectable } from '@nestjs/common';
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
