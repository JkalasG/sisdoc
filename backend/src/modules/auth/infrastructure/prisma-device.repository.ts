import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../shared/infrastructure/prisma/prisma.service';
import { DeviceRepository } from '../application/ports';

@Injectable()
export class PrismaDeviceRepository implements DeviceRepository {
  constructor(private readonly prisma: PrismaService) {}

  findByKeyHash(userId: string, keyHash: string) {
    return this.prisma.device.findUnique({ where: { userId_keyHash: { userId, keyHash } } });
  }

  create(i: Parameters<DeviceRepository['create']>[0]) {
    return this.prisma.device.create({
      data: {
        userId: i.userId, keyHash: i.keyHash, label: i.label, status: 'PENDING',
        firstIp: i.ip, lastIp: i.ip, userAgent: i.userAgent, firstSeenAt: i.now, lastSeenAt: i.now,
      },
    });
  }

  async prunePending(userId: string, keep: number, olderThan: Date) {
    const pending = await this.prisma.device.findMany({
      where: { userId, status: 'PENDING' }, orderBy: { firstSeenAt: 'desc' }, select: { id: true, firstSeenAt: true },
    });
    const drop = pending.filter((d, i) => i >= keep || d.firstSeenAt < olderThan).map((d) => d.id);
    if (!drop.length) return 0;
    const r = await this.prisma.device.deleteMany({ where: { id: { in: drop }, status: 'PENDING' } });
    return r.count;
  }

  async touch(id: string, ip: string | undefined, at: Date) {
    await this.prisma.device.update({ where: { id }, data: { lastIp: ip, lastSeenAt: at } });
  }
}
