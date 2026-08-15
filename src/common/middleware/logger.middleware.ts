import { Injectable, Logger, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';

@Injectable()
export class LoggerMiddleware implements NestMiddleware {
    private readonly logger = new Logger('HTTP');

    use(req: Request, res: Response, next: NextFunction) {
        const start = Date.now();

        res.on('finish', () => {
            const ms = Date.now() - start;
            const message = `${req.method} ${req.originalUrl} ${res.statusCode} +${ms}ms`;

            if (res.statusCode >= 500) {
                this.logger.error(message);   // red
            } else if (res.statusCode >= 400) {
                this.logger.warn(message);    // yellow
            } else {
                this.logger.log(message);     // green
            }
        });

        next();
    }
}