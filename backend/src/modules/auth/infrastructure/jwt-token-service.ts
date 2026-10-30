import { createHash, randomBytes } from 'crypto';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { TokenService } from '../application/ports';

@Injectable()
export class JwtTokenService implements TokenService {
  private readonly secret: string;

  constructor(private readonly jwt: JwtService, config: ConfigService) {
    this.secret = config.getOrThrow<string>('JWT_ACCESS_SECRET');
    if (this.secret.length < 32) throw new Error('JWT_ACCESS_SECRET debe tener al menos 32 caracteres');
  }

  signAccess(p: { userId: string; sessionId: string }, ttlSeconds: number): string {
    return this.jwt.sign(
      { sub: p.userId, sid: p.sessionId },
      { secret: this.secret, algorithm: 'HS256', expiresIn: ttlSeconds },
    );
  }

  verifyAccess(token: string) {
    try {
      const p = this.jwt.verify<{ sub?: string; sid?: string }>(token, { secret: this.secret, algorithms: ['HS256'] });
      return p.sub && p.sid ? { userId: p.sub, sessionId: p.sid } : null;
    } catch {
      return null;
    }
  }

  generateOpaqueToken(): string {
    return randomBytes(32).toString('base64url'); // 256 bits
  }

  hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }
}
