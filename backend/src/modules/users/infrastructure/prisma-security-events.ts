import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../shared/infrastructure/prisma/prisma.service';
import { SecurityEvents } from '../application/ports';

@Injectable()
export class PrismaSecurityEvents implements SecurityEvents {
  constructor(private readonly prisma: PrismaService) {}

  async record(e: { type: string; userId?: string; ip?: string; userAgent?: string; metadata?: Record<string, unknown> }) {
    await this.prisma.securityEvent.create({
      data: { type: e.type, userId: e.userId, ip: e.ip, userAgent: e.userAgent, metadata: e.metadata as Prisma.InputJsonValue | undefined },
    });
  }
}
