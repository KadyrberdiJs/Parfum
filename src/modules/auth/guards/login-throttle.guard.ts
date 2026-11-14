import {
  CanActivate,
  ExecutionContext,
  HttpException,
  Injectable,
} from '@nestjs/common';
import type { Request, Response } from 'express';
// Single-process limiter. Use shared storage or an edge limiter when running multiple replicas.
@Injectable()
export class LoginThrottleGuard implements CanActivate {
  private readonly attempts = new Map<
    string,
    { count: number; until: number }
  >();
  canActivate(context: ExecutionContext): boolean {
    const now = Date.now();
    for (const [key, value] of this.attempts)
      if (value.until <= now) this.attempts.delete(key);
    const req = context.switchToHttp().getRequest<Request>();
    const key = req.ip ?? req.socket.remoteAddress ?? 'unknown';
    let entry = this.attempts.get(key);
    if (!entry) {
      if (this.attempts.size >= 10000)
        throw new HttpException('Try again later', 429);
      entry = { count: 0, until: now + 60000 };
      this.attempts.set(key, entry);
    }
    if (++entry.count > 10) {
      context
        .switchToHttp()
        .getResponse<Response>()
        .setHeader('Retry-After', Math.ceil((entry.until - now) / 1000));
      throw new HttpException('Too many login attempts', 429);
    }
    return true;
  }
}
