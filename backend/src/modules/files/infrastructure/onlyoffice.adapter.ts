import { createHmac, timingSafeEqual } from 'crypto';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ForbiddenError, ValidationError } from '../../../shared/domain/domain-error';
import { OfficeEditorPort, OfficeTokenClaims } from '../domain/ports';

const b64url = (input: string | Buffer): string => Buffer.from(input).toString('base64url');

function signHs256(payload: Record<string, unknown>, secret: string): string {
  const header = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = b64url(JSON.stringify(payload));
  const data = `${header}.${body}`;
  const sig = createHmac('sha256', secret).update(data).digest('base64url');
  return `${data}.${sig}`;
}

function verifyHs256(token: string, secret: string): Record<string, unknown> | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const [headerB64, bodyB64, sigB64] = parts;
    const header = JSON.parse(Buffer.from(headerB64, 'base64url').toString('utf8')) as { alg?: string };
    if (header.alg !== 'HS256') return null;

    const expectedSig = createHmac('sha256', secret).update(`${headerB64}.${bodyB64}`).digest();
    const actualSig = Buffer.from(sigB64, 'base64url');
    if (expectedSig.length !== actualSig.length || !timingSafeEqual(expectedSig, actualSig)) {
      return null;
    }

    const payload = JSON.parse(Buffer.from(bodyB64, 'base64url').toString('utf8')) as Record<string, unknown>;
    const nowSec = Math.floor(Date.now() / 1000);
    if (typeof payload.exp === 'number' && payload.exp <= nowSec) return null;
    return payload;
  } catch {
    return null;
  }
}

const stripTrailingSlash = (url: string) => url.replace(/\/+$/, '');

/**
 * Adaptador de infraestructura para OnlyOffice Document Server.
 * Lee las URLs y el secreto JWT del contenedor desde las variables de entorno (.env).
 */
@Injectable()
export class OnlyOfficeAdapter implements OfficeEditorPort {
  readonly serverPublicUrl: string;
  readonly serverInternalUrl: string;
  readonly backendInternalUrl: string;
  private readonly jwtSecret: string;

  constructor(config: ConfigService) {
    this.serverPublicUrl = stripTrailingSlash(config.get<string>('ONLYOFFICE_PUBLIC_URL', 'http://localhost:8082'));
    this.serverInternalUrl = stripTrailingSlash(
      config.get<string>('ONLYOFFICE_INTERNAL_URL', this.serverPublicUrl),
    );
    this.backendInternalUrl = stripTrailingSlash(
      config.get<string>('BACKEND_INTERNAL_URL', 'http://host.docker.internal:3000'),
    );
    this.jwtSecret = config.get<string>('ONLYOFFICE_JWT_SECRET')
      ?? config.getOrThrow<string>('JWT_ACCESS_SECRET');
    if (this.jwtSecret.length < 16) {
      throw new Error('ONLYOFFICE_JWT_SECRET debe tener al menos 16 caracteres');
    }
  }

  signEditorConfig(configPayload: Record<string, unknown>): string {
    const nowSec = Math.floor(Date.now() / 1000);
    return signHs256({ ...configPayload, iat: nowSec, exp: nowSec + 12 * 3600 }, this.jwtSecret);
  }

  signActionToken(claims: OfficeTokenClaims, ttlSeconds: number): string {
    const nowSec = Math.floor(Date.now() / 1000);
    return signHs256({ ...claims, iat: nowSec, exp: nowSec + ttlSeconds }, this.jwtSecret);
  }

  verifyActionToken(token: string): OfficeTokenClaims | null {
    const p = verifyHs256(token, this.jwtSecret);
    if (!p) return null;
    if (
      (p.purpose === 'file-fetch' || p.purpose === 'callback') &&
      typeof p.documentId === 'string' &&
      typeof p.versionId === 'string' &&
      typeof p.userId === 'string'
    ) {
      return {
        purpose: p.purpose,
        documentId: p.documentId,
        versionId: p.versionId,
        userId: p.userId,
      };
    }
    return null;
  }

  verifyCallbackJwt(token: string): Record<string, unknown> | null {
    return verifyHs256(token, this.jwtSecret);
  }

  async fetchEditedFile(downloadUrl: string): Promise<Buffer> {
    // Protección anti-SSRF: solo se permite descargar desde el contenedor OnlyOffice configurado
    const allowedPublic = downloadUrl.startsWith(`${this.serverPublicUrl}/`);
    const allowedInternal = downloadUrl.startsWith(`${this.serverInternalUrl}/`);
    if (!allowedPublic && !allowedInternal) {
      throw new ForbiddenError('URL de descarga del servidor ofimático no autorizada');
    }

    const targetUrl = allowedPublic
      ? `${this.serverInternalUrl}${downloadUrl.slice(this.serverPublicUrl.length)}`
      : downloadUrl;

    // redirect:'error': una redirección podría llevar la petición a una dirección interna que la lista blanca no cubre.
    const res = await fetch(targetUrl, { redirect: 'error', signal: AbortSignal.timeout(30_000) });
    if (!res.ok) {
      throw new ValidationError(`No se pudo obtener el documento editado desde OnlyOffice (HTTP ${res.status})`);
    }
    return Buffer.from(await res.arrayBuffer());
  }
}

