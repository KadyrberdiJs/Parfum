import { Injectable, Logger, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';

const IS_DEV = process.env.NODE_ENV !== 'production';
const HIDDEN_FIELDS = ['password', 'token', 'refreshToken'];

@Injectable()
export class LoggerMiddleware implements NestMiddleware {
    private readonly logger = new Logger('HTTP');

    use(req: Request, res: Response, next: NextFunction) {
        const start = Date.now();

        res.on('finish', () => {
            const ms = Date.now() - start;
            let message = `${req.method} ${req.originalUrl} ${res.statusCode} +${ms}ms`;

              if (IS_DEV && req.body && Object.keys(req.body).length > 0) {
                  message += ` body=${JSON.stringify(this.hideSecrets(req.body), null, 2)}`;
              }

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

    private hideSecrets(body: Record<string, any>) {
        const copy = { ...body };
        for (const field of HIDDEN_FIELDS) {
            if (field in copy) copy[field] = '***';
        }
        return copy;
    }
}