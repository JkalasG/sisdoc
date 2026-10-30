import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request, Response } from 'express';
import { SESSION_POLICY } from '../domain/session';

const ONE_YEAR_MS = 365 * 24 * 60 * 60_000;
const REFRESH_PATH = '/api/v1/auth';

/** Única clase que conoce los nombres y atributos de las cookies de sesión. */
@Injectable()
export class AuthCookies {
  private readonly secure: boolean;
  private readonly prefix: string;

  constructor(config: ConfigService) {
    this.secure = config.get('NODE_ENV') === 'production';
    this.prefix = this.secure ? '__Host-' : ''; // __Host- exige Secure + Path=/ + sin Domain
  }

  get accessName() { return `${this.prefix}sisdoc_at`; }
  get deviceName() { return `${this.prefix}sisdoc_dk`; }
  get refreshName() { return `${this.secure ? '__Secure-' : ''}sisdoc_rt`; }

  private base(path: string) {
    return { httpOnly: true, secure: this.secure, sameSite: 'strict' as const, path };
  }

  setSession(res: Response, p: { accessToken: string; refreshToken: string; sessionExpiresAt: Date }) {
    res.cookie(this.accessName, p.accessToken, { ...this.base('/'), maxAge: SESSION_POLICY.accessTtlSeconds * 1000 });
    // El refresh solo viaja a /auth y vive hasta el límite absoluto de la sesión.
    res.cookie(this.refreshName, p.refreshToken, { ...this.base(REFRESH_PATH), expires: p.sessionExpiresAt });
  }

  setDevice(res: Response, deviceKey: string) {
    res.cookie(this.deviceName, deviceKey, { ...this.base('/'), maxAge: ONE_YEAR_MS });
  }

  clearSession(res: Response) {
    res.clearCookie(this.accessName, this.base('/'));
    res.clearCookie(this.refreshName, this.base(REFRESH_PATH));
  }

  readAccess(req: Request): string | undefined { return req.cookies?.[this.accessName]; }
  readRefresh(req: Request): string | undefined { return req.cookies?.[this.refreshName]; }
  readDevice(req: Request): string | undefined { return req.cookies?.[this.deviceName]; }

  /** Para WebSocket: lee la cookie de acceso desde la cabecera `cookie` del handshake. */
  readAccessFromHeader(cookieHeader?: string): string | undefined {
    if (!cookieHeader) return undefined;
    for (const part of cookieHeader.split(';')) {
      const i = part.indexOf('=');
      if (i > 0 && part.slice(0, i).trim() === this.accessName) return decodeURIComponent(part.slice(i + 1).trim());
    }
    return undefined;
  }
}
