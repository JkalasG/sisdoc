import { Mailer } from '../application/ports';

export class DisabledMailer implements Mailer {
  readonly enabled = false;
  async send(): Promise<void> {
    throw new Error('El envío de correos está desactivado (MAIL_DRIVER=off)');
  }
}
