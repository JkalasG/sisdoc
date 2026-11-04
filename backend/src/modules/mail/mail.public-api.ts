/**
 * ÚNICO punto de contacto del módulo `mail` con el resto del sistema.
 * Otros módulos inyectan `MAILER` y envían un `MailMessage`; no saben si detrás hay Gmail, un log o nada.
 */
export { MailModule } from './mail.module';
export { MAILER, Mailer, MailMessage } from './application/ports';
