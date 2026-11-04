import { MailMessage } from '../domain/mail-message';

export { MailMessage };
export const MAILER = Symbol('MAILER');

export interface Mailer {
  /** false = el sistema no puede enviar correos: las funciones que dependen de ellos (recuperar contraseña) se apagan. */
  readonly enabled: boolean;
  /** Lanza si el proveedor rechaza el envío. Nunca registra el contenido del mensaje. */
  send(message: MailMessage): Promise<void>;
}
