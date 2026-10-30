import { Injectable } from '@nestjs/common';
import * as argon2 from 'argon2';
import { PasswordHasher } from '../application/ports';

const OPTIONS = { type: argon2.argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1 } as const;

@Injectable()
export class Argon2PasswordHasher implements PasswordHasher {
  private dummyHash?: Promise<string>;

  hash(plain: string): Promise<string> {
    return argon2.hash(plain, OPTIONS);
  }

  async verify(hash: string, plain: string): Promise<boolean> {
    try {
      return await argon2.verify(hash, plain);
    } catch {
      return false; // hash corrupto: nunca autentica
    }
  }

  async verifyDummy(plain: string): Promise<void> {
    this.dummyHash ??= argon2.hash('dummy-password-for-timing', OPTIONS);
    await this.verify(await this.dummyHash, plain);
  }
}
