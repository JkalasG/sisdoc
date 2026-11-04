import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../shared/infrastructure/prisma/prisma.service';
import { PasswordResetRepository } from '../application/ports';
import { ResetCode } from '../domain/password-reset';

@Injectable()
export class PrismaPasswordResetRepository implements PasswordResetRepository {
  constructor(private readonly prisma: PrismaService) {}

  find(userId: string): Promise<ResetCode | null> {
    return this.prisma.passwordResetCode.findUnique({ where: { userId } });
  }

  async save(c: ResetCode): Promise<void> {
    const { userId, ...data } = c;
    await this.prisma.passwordResetCode.upsert({ where: { userId }, create: c, update: data });
  }

  async registerFailure(userId: string, max: number): Promise<number> {
    const row = await this.prisma.passwordResetCode.update({ where: { userId }, data: { attempts: { increment: 1 } } }).catch(() => null);
    if (!row) return max; // ya no existía (consumido o invalidado)
    if (row.attempts >= max) await this.prisma.passwordResetCode.deleteMany({ where: { userId } });
    return row.attempts;
  }

  async consume(userId: string, codeHash: string): Promise<boolean> {
    const r = await this.prisma.passwordResetCode.deleteMany({ where: { userId, codeHash } });
    return r.count === 1;
  }

  async delete(userId: string): Promise<void> {
    await this.prisma.passwordResetCode.deleteMany({ where: { userId } });
  }
}
