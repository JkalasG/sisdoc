import { Inject, Injectable } from '@nestjs/common';
import { UnauthenticatedError } from '../domain/auth-errors';
import { USER_REPOSITORY, UserRepository } from './ports';

@Injectable()
export class GetCurrentUserUseCase {
  constructor(@Inject(USER_REPOSITORY) private readonly users: UserRepository) {}

  async execute(userId: string) {
    const u = await this.users.findById(userId);
    if (!u || u.status !== 'ACTIVE') throw new UnauthenticatedError();
    // Nunca se devuelve passwordHash ni contadores internos.
    return { id: u.id, email: u.email, displayName: u.displayName, mustChangePassword: u.mustChangePassword };
  }
}
