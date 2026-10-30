import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../shared/infrastructure/prisma/prisma.service';
import { AccessLogEntry } from '../domain/document';
import { AccessLogRepository } from '../domain/ports';

@Injectable()
export class PrismaAccessLogRepository implements AccessLogRepository {
  constructor(private readonly prisma: PrismaService) {}

  async append(e: AccessLogEntry): Promise<void> {
    await this.prisma.documentAccessLog.create({
      data: { ...e, metadata: e.metadata as Prisma.InputJsonValue | undefined },
    });
  }

  async listByDocument(documentId: string, opts: { take: number; cursor?: string }) {
    const rows = await this.prisma.documentAccessLog.findMany({
      where: { documentId },
      orderBy: { createdAt: 'desc' },
      take: opts.take,
      ...(opts.cursor ? { cursor: { id: opts.cursor }, skip: 1 } : {}),
    });
    return rows.map((r) => ({
      id: r.id, documentId: r.documentId, versionId: r.versionId ?? undefined, userId: r.userId,
      action: r.action, ip: r.ip ?? undefined, userAgent: r.userAgent ?? undefined,
      channel: r.channel ?? undefined, metadata: (r.metadata ?? undefined) as Record<string, unknown> | undefined,
      createdAt: r.createdAt,
    }));
  }
}
