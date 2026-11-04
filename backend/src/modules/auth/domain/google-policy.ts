export interface GoogleProfile {
  sub: string;
  email: string;
  emailVerified: boolean;
  name?: string; // nombre que muestra Google; sirve como nombre inicial de la cuenta
  hostedDomain?: string; // claim `hd`: dominio de Google Workspace
}

/** Devuelve el motivo de rechazo, o null si el perfil cumple las reglas. `allowedDomain` vacío = cualquiera. */
export function googleProfileProblem(p: GoogleProfile, allowedDomain: string | null): string | null {
  if (!p.sub || !p.email) return 'INCOMPLETE_PROFILE';
  if (!p.emailVerified) return 'EMAIL_NOT_VERIFIED';
  if (allowedDomain) {
    const domain = allowedDomain.toLowerCase();
    // El claim `hd` lo firma Google; el sufijo del correo solo no basta para cuentas ajenas a Workspace.
    if (p.hostedDomain?.toLowerCase() !== domain) return 'DOMAIN_NOT_ALLOWED';
    if (!p.email.toLowerCase().endsWith(`@${domain}`)) return 'DOMAIN_NOT_ALLOWED';
  }
  return null;
}

/** Nombre inicial de una cuenta nueva: el de Google, o la parte local del correo. Entre 2 y 120 caracteres. */
export function displayNameFromGoogle(p: GoogleProfile): string {
  const raw = (p.name ?? '').trim().replace(/\s+/g, ' ') || p.email.split('@')[0];
  return raw.length >= 2 ? raw.slice(0, 120) : `${raw}_`.slice(0, 120);
}
