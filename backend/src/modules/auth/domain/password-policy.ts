export const PASSWORD_RULES = { minLength: 12, maxLength: 128, historySize: 5 } as const;

// Muestra mínima; se amplía con la lista de las 10 000 contraseñas más comunes.
const COMMON = new Set([
  'password1234', 'password12345', '123456789012', '1234567890123', 'qwertyuiop12', 'qwertyuiop123',
  'administrador', 'administrator', 'contrasena123', 'contraseña123', 'iloveyou1234', 'welcome12345',
  'abcdefghijkl', 'letmein12345', 'changeme1234',
]);

/** Devuelve la lista de incumplimientos (vacía = contraseña válida). */
export function validatePassword(password: string, ctx: { email: string }): string[] {
  const problems: string[] = [];
  if (password.length < PASSWORD_RULES.minLength) {
    problems.push(`Debe tener al menos ${PASSWORD_RULES.minLength} caracteres`);
  }
  if (password.length > PASSWORD_RULES.maxLength) {
    problems.push(`No puede superar ${PASSWORD_RULES.maxLength} caracteres`);
  }
  const lower = password.toLowerCase();
  if (COMMON.has(lower)) problems.push('Es una contraseña demasiado común');
  if (/^(.)\1+$/.test(password)) problems.push('No puede repetir un solo carácter');
  const local = ctx.email.split('@')[0].toLowerCase();
  if (local.length >= 3 && lower.includes(local)) problems.push('No puede contener tu correo');
  return problems;
}
