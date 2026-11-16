import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';
import type { AuthUser } from '../../common/decorators/current-user.decorator';
import { CartIdentity, GUEST_CART_LIFETIME_MS } from './cart.types';
export type CartRequest = Request & { user?: AuthUser };
@Injectable()
export class CartSession {
  constructor(private readonly config: ConfigService) {}
  guestToken(request: Request): string | undefined {
    const cookie = request.headers.cookie
      ?.split(';')
      .map((part) => part.trim())
      .find((part) => part.startsWith(`${this.cookieName()}=`));
    const token = cookie?.slice(this.cookieName().length + 1);
    return token && /^[a-f0-9]{64}$/.test(token) ? token : undefined;
  }
  identity(request: CartRequest): CartIdentity {
    return request.user
      ? { userId: request.user.id }
      : { guestToken: this.guestToken(request) };
  }
  save(response: Response, token?: string) {
    response.setHeader('Cache-Control', 'no-store');
    if (token)
      response.cookie(this.cookieName(), token, {
        ...this.cookieOptions(),
        maxAge: GUEST_CART_LIFETIME_MS,
      });
  }
  clear(response: Response) {
    response.setHeader('Cache-Control', 'no-store');
    response.clearCookie(this.cookieName(), this.cookieOptions());
  }
  private cookieName() {
    return this.config.get('NODE_ENV') === 'production'
      ? '__Host-guest_cart'
      : 'guest_cart';
  }
  private cookieOptions() {
    return {
      httpOnly: true,
      secure: this.config.get('NODE_ENV') === 'production',
      sameSite: 'lax' as const,
      path: '/',
    };
  }
}
