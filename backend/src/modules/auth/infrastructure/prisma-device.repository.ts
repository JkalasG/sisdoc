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

  async touch(id: string, ip: string | undefined, at: Date) {
    await this.prisma.device.update({ where: { id }, data: { lastIp: ip, lastSeenAt: at } });
  }
}
