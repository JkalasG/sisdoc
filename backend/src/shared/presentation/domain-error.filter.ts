import { ArgumentsHost, Catch, ExceptionFilter, HttpStatus } from '@nestjs/common';
import { Response } from 'express';
import { DomainError } from '../domain/domain-error';

const STATUS: Record<string, number> = {
  NOT_FOUND: HttpStatus.NOT_FOUND,
  FORBIDDEN: HttpStatus.FORBIDDEN,
  VALIDATION: HttpStatus.BAD_REQUEST,
  CONFLICT: HttpStatus.CONFLICT,
  INVALID_CREDENTIALS: HttpStatus.UNAUTHORIZED,
  UNAUTHENTICATED: HttpStatus.UNAUTHORIZED,
  SESSION_LIMIT: HttpStatus.CONFLICT,
  DEVICE_BLOCKED: HttpStatus.FORBIDDEN,
  PASSWORD_CHANGE_REQUIRED: HttpStatus.FORBIDDEN,
};

@Catch(DomainError)
export class DomainErrorFilter implements ExceptionFilter {
  catch(err: DomainError, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse<Response>();
    res.status(STATUS[err.code] ?? HttpStatus.UNPROCESSABLE_ENTITY).json({ code: err.code, message: err.message });
  }
}
