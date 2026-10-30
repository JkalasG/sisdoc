import { INestApplication, ValidationPipe } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { DomainErrorFilter } from './shared/presentation/domain-error.filter';
import { csrfProtection } from './shared/presentation/csrf.middleware';

/** Configuración común al servidor real y a las pruebas e2e. */
export function configureApp(app: INestApplication): void {
  const origins = (process.env.CORS_ORIGIN ?? '').split(',').map((o) => o.trim()).filter(Boolean);

  // IP real detrás de Nginx: solo se confía en el número de proxies indicado (nunca en X-Forwarded-For a ciegas).
  const hops = process.env.TRUST_PROXY;
  app.getHttpAdapter().getInstance().set('trust proxy', hops ? Number(hops) : false);

  app.use(helmet());
  app.use(cookieParser());
  app.use(csrfProtection(origins));
  app.enableCors({ origin: origins, credentials: true });
  app.setGlobalPrefix('api/v1');
  app.useGlobalFilters(new DomainErrorFilter());
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
}
