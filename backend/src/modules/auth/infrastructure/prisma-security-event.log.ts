import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../shared/infrastructure/prisma/prisma.service';
import { SecurityEventInput, SecurityEventLog } from '../application/ports';

@Injectable()
export class PrismaSecurityEventLog implements SecurityEventLog {
  private readonly logger = new Logger('SecurityEvent');

  constructor(private readonly prisma: PrismaService) {}

  async record(e: SecurityEventInput): Promise<void> {
    try {
      await this.prisma.securityEvent.create({
        data: { ...e, metadata: e.metadata as Prisma.InputJsonValue | undefined },
      });
    } catch (err) {
      // El login no debe caerse porque falle la bitácora, pero el fallo queda visible en logs.
      this.logger.error(`No se pudo registrar ${e.type}: ${(err as Error).message}`);
    }
  }
}
