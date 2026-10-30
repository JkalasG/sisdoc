/**
 * Contrato público del módulo auth. Otros módulos importan SOLO este archivo.
 * Uso típico: `@UseGuards(JwtCookieGuard)` en un controlador y `@CurrentUser()` para leer el usuario.
 */
export { AuthModule } from './auth.module';
export { JwtCookieGuard, AllowWhenPasswordChangePending } from './presentation/jwt-cookie.guard';
export { AuthCookies } from './presentation/auth-cookies';
export { AuthenticateRequestUseCase, AuthContext } from './application/authenticate-request.use-case';
