import { Logger } from '@nestjs/common';
import { OAuth2Client } from 'google-auth-library';
import { Mailer, MailMessage } from '../application/ports';
import { buildRawMessage } from '../domain/mime';

const SEND_URL = 'https://gmail.googleapis.com/gmail/v1/users/me/messages/send';

export interface GmailSettings {
  clientId: string; clientSecret: string; refreshToken: string; fromAddress: string; fromName: string;
}

/** Envía por la API de Gmail con OAuth2 (refresh token). El permiso necesario es solo `gmail.send`. */
export class GmailMailer implements Mailer {
  readonly enabled = true;
  private readonly logger = new Logger('Gmail');
  private readonly auth: OAuth2Client;

  constructor(private readonly s: GmailSettings) {
    this.auth = new OAuth2Client(s.clientId, s.clientSecret);
    this.auth.setCredentials({ refresh_token: s.refreshToken });
  }

  async send(m: MailMessage): Promise<void> {
    const { token } = await this.auth.getAccessToken();
    if (!token) throw new Error('Gmail no entregó un token de acceso (¿refresh token revocado?)');
    const res = await fetch(SEND_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ raw: buildRawMessage({ name: this.s.fromName, address: this.s.fromAddress }, m) }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      // Se registra el estado y el motivo de Google, jamás el cuerpo del correo (lleva el código de un solo uso).
      const reason = ((await res.json().catch(() => ({}))) as { error?: { message?: string } }).error?.message ?? '';
      this.logger.error(`Gmail rechazó el envío: HTTP ${res.status} ${reason}`);
      throw new Error(`Gmail respondió ${res.status}`);
    }
  }
}
