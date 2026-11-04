import { Logger } from '@nestjs/common';
import { Mailer, MailMessage } from '../application/ports';

/**
 * SOLO DESARROLLO: no envía nada, escribe el mensaje en la consola para poder probar sin Gmail.
 * El módulo se niega a usarlo en producción (el contenido incluye códigos de un solo uso).
 */
export class LogMailer implements Mailer {
  readonly enabled = true;
  private readonly logger = new Logger('MailLog');
  async send(m: MailMessage): Promise<void> {
    this.logger.warn(`[DESARROLLO] Correo a ${m.to} — ${m.subject}\n${m.text}`);
  }
}
