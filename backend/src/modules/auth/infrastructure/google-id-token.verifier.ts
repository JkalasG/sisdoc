import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OAuth2Client } from 'google-auth-library';
import { GoogleIdentity } from '../application/ports';
import { GoogleProfile } from '../domain/google-policy';
import { flag } from './auth-flags';

/** Valida el ID token de Google (firma con las claves públicas de Google, emisor, vencimiento y audiencia = nuestro Client ID). */
@Injectable()
export class GoogleIdTokenVerifier implements GoogleIdentity {
  private readonly logger = new Logger('GoogleLogin');
  readonly enabled: boolean;
  readonly allowedDomain: string | null;
  readonly autoRegister: boolean;
  private readonly clientId: string;
  private readonly client: OAuth2Client;

  constructor(config: ConfigService) {
    this.enabled = flag(config, 'GOOGLE_LOGIN_ENABLED');
    this.autoRegister = flag(config, 'GOOGLE_AUTO_REGISTER');
    this.clientId = String(config.get('GOOGLE_CLIENT_ID', '')).trim();
    this.allowedDomain = String(config.get('GOOGLE_ALLOWED_DOMAIN', '')).trim().toLowerCase().replace(/^@/, '') || null;
    if (this.allowedDomain && !/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(this.allowedDomain)) {
      throw new Error(`GOOGLE_ALLOWED_DOMAIN debe ser un dominio de correo como empresa.com (recibido: ${this.allowedDomain})`);
    }
    if (this.enabled && !this.clientId) throw new Error('GOOGLE_LOGIN_ENABLED=true exige GOOGLE_CLIENT_ID');
    this.client = new OAuth2Client(this.clientId || undefined);
  }

  async verify(idToken: string): Promise<GoogleProfile | null> {
    try {
      const ticket = await this.client.verifyIdToken({ idToken, audience: this.clientId });
      const p = ticket.getPayload();
      if (!p?.sub || !p.email) return null;
      return { sub: p.sub, email: p.email, emailVerified: p.email_verified === true, hostedDomain: p.hd, name: p.name };
    } catch (e) {
      this.logger.warn(`ID token rechazado: ${(e as Error).message}`);
      return null;
    }
  }
}
