import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../shared/infrastructure/prisma/prisma.service';
import { SessionRepository } from '../application/ports';
import { RevokeReason } from '../domain/session';

@Injectable()
export class PrismaSessionRepository implements SessionRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(i: Parameters<SessionRepository['create']>[0]) {
    return this.prisma.session.create({
      data: {
        userId: i.userId, deviceId: i.deviceId, refreshHash: i.refreshHash, ip: i.ip, userAgent: i.userAgent,
        createdAt: i.now, lastActivityAt: i.now, absoluteExpiresAt: i.absoluteExpiresAt,
      },
    });
  }

  async findWithOwner(sessionId: string) {
    const row = await this.prisma.session.findUnique({
      where: { id: sessionId },
      include: {
        user: { select: { id: true, status: true, mustChangePassword: true } },
        device: { select: { id: true, status: true } },
      },
    });
    if (!row) return null;
    const { user, device, ...session } = row;
    return { session, user, device };
  }

  findByRefreshHash(hash: string) {
    return this.prisma.session.findUnique({ where: { refreshHash: hash } });
  }

  findByPrevRefreshHash(hash: string) {
    return this.prisma.session.findFirst({ where: { prevRefreshHash: hash } });
  }

  countLive(userId: string, p: { now: Date; inactiveBefore: Date }) {
    return this.prisma.session.count({
      where: {
        userId, revokedAt: null,
        absoluteExpiresAt: { gt: p.now },
        lastActivityAt: { gt: p.inactiveBefore },
      },
    });
  }

  async rotate(id: string, p: { oldHash: string; newHash: string; at: Date }) {
    const r = await this.prisma.session.updateMany({
      where: { id, refreshHash: p.oldHash, revokedAt: null },
      data: { refreshHash: p.newHash, prevRefreshHash: p.oldHash, lastActivityAt: p.at },
    });
    return r.count === 1;
  }

  async touch(id: string, at: Date) {
    await this.prisma.session.update({ where: { id }, data: { lastActivityAt: at } });
  }

  async revoke(id: string, reason: RevokeReason, at: Date) {
    await this.prisma.session.updateMany({
      where: { id, revokedAt: null }, data: { revokedAt: at, revokedReason: reason },
    });
  }

  async revokeAllForUser(userId: string, reason: RevokeReason, at: Date, exceptSessionId?: string) {
    await this.prisma.session.updateMany({
      where: { userId, revokedAt: null, ...(exceptSessionId ? { id: { not: exceptSessionId } } : {}) },
      data: { revokedAt: at, revokedReason: reason },
    });
  }
}
