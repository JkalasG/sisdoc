export interface MailMessage {
  to: string;
  subject: string;
  text: string; // versión de texto plano (siempre se envía junto al HTML)
  html: string;
}
