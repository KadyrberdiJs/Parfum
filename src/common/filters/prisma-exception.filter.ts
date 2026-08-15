import { ArgumentsHost, Catch, ExceptionFilter, HttpStatus } from "@nestjs/common";
import { Response } from "express";
import { Prisma } from "generated/prisma/client";

@Catch(Prisma.PrismaClientKnownRequestError)
export class PrismaExceptionFilter implements ExceptionFilter {
    catch(exception: Prisma.PrismaClientKnownRequestError, host: ArgumentsHost) {
        const res = host.switchToHttp().getResponse<Response>();

        switch (exception.code) {
            case 'P2002':
                const fields = (exception.meta?.target as string[])?.join(',');             
                return res.status(HttpStatus.CONFLICT).json({
                    statusCode: 409,
                    message: `Unique constraint failed on: ${fields}`,
                    error: "Conflict",
                });
            case 'P2025':
                return res.status(HttpStatus.NOT_FOUND).json({
                    statusCode: 404,
                    message: 'Record not found',
                    error: 'Not Found',
                });
            default:
                return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
                    statusCode: 500,
                    message: 'Internal server error',
                    error: 'Internal server error'
                });
        }
    }
}