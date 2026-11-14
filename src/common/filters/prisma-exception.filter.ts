import { ArgumentsHost, Catch, ExceptionFilter, Logger } from '@nestjs/common';
import type { Response } from 'express';
import { Prisma } from '../../../generated/prisma/client';
@Catch(Prisma.PrismaClientKnownRequestError)
export class PrismaExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(PrismaExceptionFilter.name);
  catch(exception: Prisma.PrismaClientKnownRequestError, host: ArgumentsHost) {
    const errors: Record<string, [number, string]> = {
      P2002: [409, 'A record with these unique values already exists'],
      P2025: [404, 'Record not found'],
      P2003: [409, 'Related record missing or still in use'],
      P2034: [409, 'Concurrent change detected; retry the request'],
    };
    const [statusCode, message] = errors[exception.code] ?? [
      500,
      'Internal server error',
    ];
    if (statusCode === 500)
      this.logger.error(`Database error: ${exception.code}`);
    return host
      .switchToHttp()
      .getResponse<Response>()
      .status(statusCode)
      .json({ statusCode, message });
  }
}
