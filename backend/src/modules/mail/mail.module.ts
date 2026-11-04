import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MAILER, Mailer } from './application/ports';
import { DisabledMailer } from './infrastructure/disabled-mailer';
import { GmailMailer } from './infrastructure/gmail-mailer';
import { LogMailer } from './infrastructure/log-mailer';

/** Elige el proveedor según MAIL_DRIVER y valida la configuración al arrancar (si falta algo, el servidor no inicia). */
export function createMailer(config: Pick<ConfigService, 'get'>): Mailer {
  const get = (k: string) => String(config.get(k, '') ?? '').trim();
  const driver = (get('MAIL_DRIVER') || 'off').toLowerCase();

  if (driver === 'off') return new DisabledMailer();
  if (driver === 'log') {
    if (get('NODE_ENV') === 'production') throw new Error('MAIL_DRIVER=log no está permitido en producción: imprime los códigos en la consola');
    return new LogMailer();
  }
  if (driver === 'gmail') {
    const missing = ['GMAIL_CLIENT_ID', 'GMAIL_CLIENT_SECRET', 'GMAIL_REFRESH_TOKEN', 'MAIL_FROM'].filter((k) => !get(k));
    if (missing.length) throw new Error(`MAIL_DRIVER=gmail exige: ${missing.join(', ')}`);
    if (!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(get('MAIL_FROM'))) throw new Error('MAIL_FROM debe ser una dirección de correo (ej. notificaciones@empresa.com)');
    return new GmailMailer({
      clientId: get('GMAIL_CLIENT_ID'), clientSecret: get('GMAIL_CLIENT_SECRET'), refreshToken: get('GMAIL_REFRESH_TOKEN'),
      fromAddress: get('MAIL_FROM'), fromName: get('MAIL_FROM_NAME') || 'Iris',
    });
  }
  throw new Error(`MAIL_DRIVER inválido: "${driver}" (usa off, gmail o log)`);
}

@Module({
  providers: [{ provide: MAILER, inject: [ConfigService], useFactory: createMailer }],
  exports: [MAILER],
})
export class MailModule {}
