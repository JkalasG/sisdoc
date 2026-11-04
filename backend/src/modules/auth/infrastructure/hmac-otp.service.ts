import { createHmac, randomInt, timingSafeEqual } from 'crypto';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OtpService } from '../application/ports';
import { PASSWORD_RESET } from '../domain/password-reset';

@Injectable()
export class HmacOtpService implements OtpService {
  private readonly key: Buffer;

  constructor(config: ConfigService) {
    const secret = config.getOrThrow<string>('JWT_ACCESS_SECRET');
    // Separación de dominios: la misma clave base no sirve para firmar tokens y para estos códigos a la vez.
    this.key = createHmac('sha256', secret).update('password-reset-otp').digest();
  }

  generate(): string {
    return String(randomInt(0, 10 ** PASSWORD_RESET.codeLength)).padStart(PASSWORD_RESET.codeLength, '0');
  }

  hash(userId: string, code: string): string {
    return createHmac('sha256', this.key).update(`${userId}|${code}`).digest('hex');
  }

  matches(expectedHash: string, userId: string, code: string): boolean {
    const a = Buffer.from(expectedHash, 'hex');
    const b = Buffer.from(this.hash(userId, code), 'hex');
    return a.length === b.length && timingSafeEqual(a, b);
  }
}
