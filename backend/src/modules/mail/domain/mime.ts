import { randomBytes } from 'crypto';
import { MailMessage } from './mail-message';

/** Un salto de línea en un encabezado permitiría inyectar otros encabezados (p. ej. un Bcc oculto). */
function header(value: string, name: string): string {
  if (/[\r\n]/.test(value)) throw new Error(`El encabezado ${name} no puede contener saltos de línea`);
  return value;
}

/** Palabra codificada RFC 2047: permite tildes y "ñ" en el asunto y el nombre del remitente. */
const encodeWord = (s: string) => (/^[\x20-\x7e]*$/.test(s) ? s : `=?UTF-8?B?${Buffer.from(s, 'utf8').toString('base64')}?=`);

const base64Lines = (s: string) => (Buffer.from(s, 'utf8').toString('base64').match(/.{1,76}/g) ?? []).join('\r\n');

/** Construye el mensaje MIME (texto + HTML) y lo devuelve en base64url, el formato que exige la API de Gmail. */
export function buildRawMessage(from: { name: string; address: string }, m: MailMessage): string {
  const boundary = `iris_${randomBytes(12).toString('hex')}`;
  const fromName = header(from.name, 'From');
  const lines = [
    `From: ${fromName ? `${encodeWord(fromName)} ` : ''}<${header(from.address, 'From')}>`,
    `To: ${header(m.to, 'To')}`,
    `Subject: ${encodeWord(header(m.subject, 'Subject'))}`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    'Content-Type: text/plain; charset="UTF-8"',
    'Content-Transfer-Encoding: base64',
    '',
    base64Lines(m.text),
    `--${boundary}`,
    'Content-Type: text/html; charset="UTF-8"',
    'Content-Transfer-Encoding: base64',
    '',
    base64Lines(m.html),
    `--${boundary}--`,
    '',
  ];
  return Buffer.from(lines.join('\r\n'), 'utf8').toString('base64url');
}
