import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../shared/infrastructure/prisma/prisma.service';
import { AdminDeviceRepository } from '../application/ports';

@Injectable()
export class PrismaAdminDeviceRepository implements AdminDeviceRepository {
  constructor(private readonly prisma: PrismaService) {}

  async listAll() {
    const rows = await this.prisma.device.findMany({
      include: { user: { select: { displayName: true, email: true } } },
      orderBy: { firstSeenAt: 'desc' },
    });
    return rows.map((d) => ({
      id: d.id, user: d.user.displayName, email: d.user.email, label: d.label ?? 'Dispositivo',
      ip: d.lastIp ?? d.firstIp ?? '—', firstIp: d.firstIp ?? '—', code: d.id.slice(0, 8).toUpperCase(),
      userAgent: d.userAgent ?? '', status: d.status,
      firstSeen: d.firstSeenAt.toISOString(), lastSeen: d.lastSeenAt.toISOString(),
    }));
  }

  async decide(id: string, status: 'TRUSTED' | 'BLOCKED', adminId: string) {
    const d = await this.prisma.device.findUnique({ where: { id } });
    if (!d) return false;
    const now = new Date();
    await this.prisma.$transaction([
      this.prisma.device.update({ where: { id }, data: { status, decidedAt: now, decidedById: adminId } }),
      ...(status === 'BLOCKED'
        ? [this.prisma.session.updateMany({ where: { deviceId: id, revokedAt: null }, data: { revokedAt: now, revokedReason: 'DEVICE_BLOCKED' } })]
        : []),
      this.prisma.securityEvent.create({
        data: { type: status === 'TRUSTED' ? 'DEVICE_APPROVED' : 'DEVICE_BLOCKED', userId: d.userId, deviceId: id, metadata: { by: adminId, label: d.label } },
      }),
    ]);
    return true;
  }
}
