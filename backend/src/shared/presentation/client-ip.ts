import { Request } from 'express';

/** IPv4 "mapeada" (::ffff:1.2.3.4) → 1.2.3.4; el loopback IPv6 (::1) → 127.0.0.1. Así la misma IP se guarda siempre igual. */
export function normalizeIp(ip?: string): string | undefined {
  if (!ip) return undefined;
  const v = ip.trim().replace(/^::ffff:/i, '');
  return v === '::1' ? '127.0.0.1' : v;
}

/**
 * IP real del cliente. `req.ip` ya respeta TRUST_PROXY (nº de proxies de confianza, ver app.setup.ts):
 * con TRUST_PROXY=1 toma la dirección que el proxy escribió en X-Forwarded-For; sin él, ignora esa cabecera
 * (nadie puede falsear su IP desde fuera).
 */
export const clientIp = (req: Request): string | undefined => normalizeIp(req.ip);
