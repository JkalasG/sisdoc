const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

export interface ResetEmail { subject: string; text: string; html: string }

const frame = (title: string, bodyHtml: string) => `<!doctype html>
<html lang="es"><body style="margin:0;background:#f3f4f8;font-family:Arial,Helvetica,sans-serif;color:#1d2433">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="480" cellpadding="0" cellspacing="0" style="max-width:480px;background:#ffffff;border-radius:12px;padding:32px">
<tr><td><h1 style="margin:0 0 16px;font-size:20px">${escapeHtml(title)}</h1>${bodyHtml}
<p style="margin:24px 0 0;font-size:12px;color:#6b7280">Si no fuiste tú, ignora este mensaje: tu contraseña no cambiará.</p>
</td></tr></table></td></tr></table></body></html>`;

/** Correo con el código de un solo uso. `code` son solo dígitos (se valida aquí además de generarse así). */
export function resetCodeEmail(displayName: string, code: string, ttlMinutes: number): ResetEmail {
  if (!/^\d+$/.test(code)) throw new Error('El código debe ser numérico');
  const name = displayName.trim() || 'hola';
  return {
    subject: `${code} es tu código para recuperar tu contraseña`,
    text: `Hola ${name},\n\nTu código de verificación es: ${code}\n\nVence en ${ttlMinutes} minutos y solo sirve una vez. `
      + 'No lo compartas con nadie: nadie del equipo te lo pedirá.\n\nSi no solicitaste este código, ignora este mensaje.',
    html: frame('Recupera tu contraseña', `<p style="margin:0 0 12px">Hola ${escapeHtml(name)},</p>
<p style="margin:0 0 16px">Usa este código para crear una contraseña nueva:</p>
<p style="margin:0 0 16px;font-size:34px;font-weight:700;letter-spacing:8px;color:#3b4cca">${code}</p>
<p style="margin:0;font-size:14px">Vence en <strong>${ttlMinutes} minutos</strong> y solo sirve una vez. No lo compartas con nadie.</p>`),
  };
}

export function passwordChangedEmail(displayName: string): ResetEmail {
  const name = displayName.trim() || 'hola';
  return {
    subject: 'Tu contraseña fue cambiada',
    text: `Hola ${name},\n\nTu contraseña acaba de cambiarse y se cerraron todas tus sesiones abiertas.\n\n`
      + 'Si no fuiste tú, contacta a un administrador de inmediato.',
    html: frame('Tu contraseña fue cambiada', `<p style="margin:0 0 12px">Hola ${escapeHtml(name)},</p>
<p style="margin:0">Tu contraseña acaba de cambiarse y se cerraron todas tus sesiones abiertas. <strong>Si no fuiste tú, contacta a un administrador de inmediato.</strong></p>`),
  };
}
