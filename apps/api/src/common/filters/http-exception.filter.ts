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
import { MulterError } from 'multer';
import { TenantMismatchError } from '../../prisma/tenant-guard.errors';

const RECORD_NOT_FOUND = 'P2025';

// Multer aborts the upload stream itself, so an oversized file never reaches a controller
// and this filter is the only place that can turn it into a message an admin can act on.
//
// @nestjs/platform-express already re-throws MulterError as an HttpException, keeping
// multer's own terse wording ("File too large") and dropping the `code` — so matching the
// wrapped exception by its default message is the only hook left. The raw MulterError
// branch below still covers anything thrown outside that interceptor.
const MULTER_DEFAULT_MESSAGES: Record<string, { statusCode: number; message: string }> = {
  'File too large': {
    statusCode: HttpStatus.PAYLOAD_TOO_LARGE,
    message: 'This file is larger than the 5 MB limit. Split it and upload in parts.',
  },
  'Too many files': {
    statusCode: HttpStatus.BAD_REQUEST,
    message: 'Upload one file at a time.',
  },
  'Unexpected field': {
    statusCode: HttpStatus.BAD_REQUEST,
    message: 'Attach the file in the "file" field.',
  },
};

const MULTER_CODE_MESSAGES: Record<string, { statusCode: number; message: string }> = {
  LIMIT_FILE_SIZE: MULTER_DEFAULT_MESSAGES['File too large'],
  LIMIT_FILE_COUNT: MULTER_DEFAULT_MESSAGES['Too many files'],
  LIMIT_UNEXPECTED_FILE: MULTER_DEFAULT_MESSAGES['Unexpected field'],
};

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
      const wrappedMulter = MULTER_DEFAULT_MESSAGES[exception.message];
      if (wrappedMulter) {
        return wrappedMulter;
      }

      const exceptionResponse = exception.getResponse();
      const message =
        typeof exceptionResponse === 'string'
          ? exceptionResponse
          : ((exceptionResponse as { message?: string | string[] }).message ?? 'Internal server error');
      return { statusCode: exception.getStatus(), message };
    }

    if (exception instanceof MulterError) {
      return (
        MULTER_CODE_MESSAGES[exception.code] ?? {
          statusCode: HttpStatus.BAD_REQUEST,
          message: 'The upload could not be read. Attach a single CSV file and try again.',
        }
      );
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
