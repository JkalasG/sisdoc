import { Inject, Injectable } from '@nestjs/common';
import { ForbiddenError, NotFoundError } from '../../../shared/domain/domain-error';
import { ADMIN_DEVICE_REPOSITORY, AdminDeviceRepository, USER_REPOSITORY, UserRepository } from './ports';

/** Gestión de dispositivos: solo para usuarios con el rol ADMIN. */
@Injectable()
export class ManageDevicesUseCase {
  constructor(
    @Inject(ADMIN_DEVICE_REPOSITORY) private readonly devices: AdminDeviceRepository,
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
  ) {}

  private async assertAdmin(userId: string) {
    const u = await this.users.findById(userId);
    if (!u?.roles?.includes('ADMIN')) throw new ForbiddenError('Solo administradores');
  }

  async list(adminId: string) {
    await this.assertAdmin(adminId);
    return this.devices.listAll();
  }

  async decide(adminId: string, deviceId: string, status: 'TRUSTED' | 'BLOCKED') {
    await this.assertAdmin(adminId);
    if (!(await this.devices.decide(deviceId, status, adminId))) throw new NotFoundError('Dispositivo');
  }
}
