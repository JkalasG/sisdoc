import { NextFunction, Request, Response } from 'express';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Defensa CSRF adicional a SameSite=Strict: toda petición que modifica datos debe llevar
 * `X-Requested-With: XMLHttpRequest` (un formulario de otro sitio no puede añadirla) y,
 * si trae `Origin`, este debe estar permitido.
 */
export function csrfProtection(allowedOrigins: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (SAFE_METHODS.has(req.method)) return next();
    // Webhook servidor-a-servidor de OnlyOffice: no usa cookies de sesión y exige doble token JWT firmado
    if (req.path.endsWith('/office-callback')) return next();
    const origin = req.headers.origin;
    const badOrigin = origin && allowedOrigins.length > 0 && !allowedOrigins.includes(origin);
    if (req.headers['x-requested-with'] !== 'XMLHttpRequest' || badOrigin) {
      return res.status(403).json({ code: 'CSRF', message: 'Petición no permitida' });
    }
    next();
  };
}
