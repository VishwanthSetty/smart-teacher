import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Request, Response } from 'express';
import { TenantMismatchError } from '../../prisma/tenant-guard.errors';

const RECORD_NOT_FOUND = 'P2025';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('HttpExceptionFilter');

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const { statusCode, message } = this.resolveResponse(exception, request);

    response.status(statusCode).json({
      statusCode,
      message,
      error: HttpStatus[statusCode] ?? 'Error',
      timestamp: new Date().toISOString(),
      path: request.url,
    });
  }

  private resolveResponse(
    exception: unknown,
    request: Request,
  ): { statusCode: number; message: string | string[] } {
    if (exception instanceof HttpException) {
      const exceptionResponse = exception.getResponse();
      const message =
        typeof exceptionResponse === 'string'
          ? exceptionResponse
          : ((exceptionResponse as { message?: string | string[] }).message ?? 'Internal server error');
      return { statusCode: exception.getStatus(), message };
    }

    // A cross-tenant write attempt is a client error, not a leak of the other
    // tenant's existence — a flat message is enough, no need to echo the mismatch.
    if (exception instanceof TenantMismatchError) {
      return { statusCode: HttpStatus.BAD_REQUEST, message: 'This request cannot be completed.' };
    }

    // Cross-tenant unique-where reads/writes miss (extended-where-unique folds
    // schoolId into the lookup) — 404, never 403, so existence is never confirmed.
    if (exception instanceof Prisma.PrismaClientKnownRequestError && exception.code === RECORD_NOT_FOUND) {
      return { statusCode: HttpStatus.NOT_FOUND, message: 'Resource not found.' };
    }

    // Anything else is unexpected — log the full error (with stack) to aid diagnosis.
    this.logger.error(
      `Unhandled exception on ${request.method} ${request.url}`,
      exception instanceof Error ? exception.stack : String(exception),
    );
    return { statusCode: HttpStatus.INTERNAL_SERVER_ERROR, message: 'Internal server error' };
  }
}
