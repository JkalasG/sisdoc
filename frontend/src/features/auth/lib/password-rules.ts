const COMMON = ['password1234', '123456789012', 'qwertyuiop12', 'changeme1234'];

/** Mismas reglas que el backend (domain/password-policy.ts). El servidor siempre vuelve a validar. */
export function passwordRules(pw: string, email: string) {
  const local = email.split('@')[0].toLowerCase();
  return [
    { ok: pw.length >= 12, text: 'Al menos 12 caracteres' },
    { ok: pw.length > 0 && !COMMON.includes(pw.toLowerCase()), text: 'No es una contraseña común' },
    { ok: pw.length > 0 && !(local.length >= 3 && pw.toLowerCase().includes(local)), text: 'No contiene tu correo' },
  ];
}
