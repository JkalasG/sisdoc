import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CaptchaVerifier } from '../application/ports';
import { flag } from './auth-flags';

const VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

/** Cloudflare Turnstile. Falla CERRADO: si Cloudflare no responde, no se deja pasar a nadie. */
@Injectable()
export class TurnstileCaptchaVerifier implements CaptchaVerifier {
  private readonly logger = new Logger('Turnstile');
  readonly enabled: boolean;
  private readonly secret: string;

  constructor(config: ConfigService) {
    this.enabled = flag(config, 'CAPTCHA_ENABLED');
    this.secret = String(config.get('TURNSTILE_SECRET_KEY', '')).trim();
    if (this.enabled && !this.secret) throw new Error('CAPTCHA_ENABLED=true exige TURNSTILE_SECRET_KEY');
  }

  async verify(token: string | undefined, ip?: string): Promise<boolean> {
    if (!token || token.length > 2048) return false;
    try {
      const body = new URLSearchParams({ secret: this.secret, response: token });
      if (ip) body.set('remoteip', ip);
      const res = await fetch(VERIFY_URL, { method: 'POST', body, signal: AbortSignal.timeout(5000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return ((await res.json()) as { success?: boolean }).success === true;
    } catch (e) {
      this.logger.error(`No se pudo verificar el captcha: ${(e as Error).message}`);
      return false;
    }
  }
}
