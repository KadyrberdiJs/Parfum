import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  HttpException,
  Injectable,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';
@Injectable()
export class CartRequestGuard implements CanActivate {
  private readonly attempts = new Map<
    string,
    { count: number; until: number }
  >();
  private nextCleanup = 0;
  constructor(private readonly config: ConfigService) {}
  canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<Request>();
    const response = context.switchToHttp().getResponse<Response>();
    response.setHeader('Cache-Control', 'no-store');
    this.limitRequests(request);
    if (['GET', 'HEAD', 'OPTIONS'].includes(request.method)) return true;
    if (request.get('X-Cart-Request') !== '1')
      throw new ForbiddenException('X-Cart-Request: 1 is required');
    const origin = request.get('Origin');
    const allowed = (this.config.get<string>('CART_ALLOWED_ORIGINS') ?? '')
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean);
    const sameOrigin = `${request.protocol}://${request.get('host')}`;
    if (origin && origin !== sameOrigin && !allowed.includes(origin))
      throw new ForbiddenException('Origin is not allowed');
    if (!origin && request.get('Sec-Fetch-Site') === 'cross-site')
      throw new ForbiddenException('Cross-site cart writes are not allowed');
    return true;
  }
  private limitRequests(request: Request) {
    const now = Date.now();
    if (now >= this.nextCleanup) {
      for (const [key, value] of this.attempts)
        if (value.until <= now) this.attempts.delete(key);
      this.nextCleanup = now + 60000;
    }
    const key = request.ip ?? request.socket.remoteAddress ?? 'unknown';
    let entry = this.attempts.get(key);
    if (!entry || entry.until <= now) {
      if (!entry && this.attempts.size >= 10000)
        throw new HttpException('Try again later', 429);
      entry = { count: 0, until: now + 60000 };
      this.attempts.set(key, entry);
    }
    if (++entry.count > 120)
      throw new HttpException('Too many cart requests', 429);
  }
}
