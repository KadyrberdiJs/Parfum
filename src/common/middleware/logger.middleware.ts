import { Injectable, Logger, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';

const IS_DEV = process.env.NODE_ENV !== 'production';
const HIDDEN_FIELDS = ['password', 'token', 'refreshToken'];

const BLUE = '\x1b[94m';
const ORANGE = '\x1b[38;5;208m';
const RESET = '\x1b[0m';

@Injectable()
export class LoggerMiddleware implements NestMiddleware {
    private readonly logger = new Logger('HTTP');

    use(req: Request, res: Response, next: NextFunction) {
        const start = Date.now();

        res.on('finish', () => {
            const ms = Date.now() - start;
            let message = `${req.method} ${req.originalUrl} ${res.statusCode} +${ms}ms`;

            if (IS_DEV && req.body && Object.keys(req.body).length > 0) {
                message += `\n${this.colorizeJson(this.hideSecrets(req.body))}`;
            }

            if (res.statusCode >= 500) {
                this.logger.error(message);
            } else if (res.statusCode >= 400) {
                this.logger.warn(message);
            } else {
                this.logger.log(message);
            }
        });

        next();
    }

    private colorizeJson(obj: Record<string, any>): string {
        const json = JSON.stringify(obj, null, 2);
        return json.replace(
            /"([^"]+)": ("[^"]*"|[\d.-]+|true|false|null)/g,
            (_match, key, value) =>
                `${BLUE}"${key}"${RESET}: ${ORANGE}${value}${RESET}`,
        );
    }

    private hideSecrets(body: Record<string, any>) {
        const copy = { ...body };
        for (const field of HIDDEN_FIELDS) {
            if (field in copy) copy[field] = '***';
        }
        return copy;
    }
}