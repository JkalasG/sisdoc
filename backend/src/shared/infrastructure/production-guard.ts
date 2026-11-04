/** Valores de ejemplo publicados en el repositorio o en la documentación: jamás deben llegar a producción. */
const KNOWN_WEAK = [
  'cambia-esto', 'changeme', 'secret', 'password', 'sisdoc_dev', 'sisdoc_onlyoffice_jwt_secret_2026_seguro', 'ejemplo', 'example',
];

const weak = (value: string) => KNOWN_WEAK.some((w) => value.toLowerCase().includes(w));

/**
 * Se ejecuta SOLO con NODE_ENV=production y devuelve la lista de problemas (vacía = puede arrancar).
 * Una mala configuración de producción es la causa de seguridad más común; aquí se convierte en un error de arranque.
 */
export function productionProblems(env: Record<string, string | undefined>): string[] {
  if (env.NODE_ENV !== 'production') return [];
  const problems: string[] = [];
  const get = (k: string) => (env[k] ?? '').trim();

  const jwt = get('JWT_ACCESS_SECRET');
  if (jwt.length < 32 || weak(jwt)) problems.push('JWT_ACCESS_SECRET es débil o es el valor de ejemplo (genera uno aleatorio de 48+ bytes)');
  const office = get('ONLYOFFICE_JWT_SECRET');
  if (office && (office.length < 32 || weak(office))) problems.push('ONLYOFFICE_JWT_SECRET es débil o es el valor publicado en docker-compose.yml');
  if (weak(get('DATABASE_URL'))) problems.push('DATABASE_URL usa la contraseña de desarrollo (sisdoc_dev)');

  const origins = get('CORS_ORIGIN').split(',').map((o) => o.trim()).filter(Boolean);
  if (!origins.length) problems.push('CORS_ORIGIN está vacío: indica el dominio exacto del frontend');
  if (origins.some((o) => !o.startsWith('https://'))) problems.push('CORS_ORIGIN debe usar https:// en producción');
  if (!get('TRUST_PROXY')) problems.push('TRUST_PROXY está vacío: detrás de Nginx todas las IP se verían como la del proxy (límites e IP de dispositivos incorrectos)');
  if (get('DISABLE_THROTTLE') === 'true') problems.push('DISABLE_THROTTLE=true no debe existir en producción');
  return problems;
}

export function assertProductionConfig(env: Record<string, string | undefined> = process.env): void {
  const problems = productionProblems(env);
  if (problems.length) throw new Error(`Configuración de producción insegura:\n - ${problems.join('\n - ')}`);
}
