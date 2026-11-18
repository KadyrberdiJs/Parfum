import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { CookieOptions, Request, Response } from 'express';
import {
  CartOwner,
  CartRequest,
  GUEST_CART_LIFETIME_MS,
  isValidGuestToken,
} from './cart.types';

@Injectable()
export class CartSession {
  private readonly cookieName: string;
  private readonly cookieOptions: CookieOptions;

  constructor(config: ConfigService) {
    const isProduction = config.get('NODE_ENV') === 'production';
    // Browsers reject __Host- cookies without HTTPS, so only use the prefix in production.
    this.cookieName = isProduction ? '__Host-guest_cart' : 'guest_cart';
    this.cookieOptions = {
      httpOnly: true,
      secure: isProduction,
      sameSite: 'lax',
      path: '/',
    };
  }

  getCartOwner(request: CartRequest): CartOwner {
    if (request.user) return { userId: request.user.id };
    return { guestToken: this.readGuestToken(request) };
  }

  readGuestToken(request: Request): string | undefined {
    const token: unknown = request.cookies?.[this.cookieName];
    if (typeof token !== 'string') return undefined;
    if (!isValidGuestToken(token)) return undefined;
    return token;
  }

  // Sent on every change so the cookie's 30 days restart together with the cart's expiresAt.
  saveGuestToken(response: Response, guestToken: string) {
    response.cookie(this.cookieName, guestToken, {
      ...this.cookieOptions,
      maxAge: GUEST_CART_LIFETIME_MS,
    });
  }

  clearGuestToken(response: Response) {
    response.clearCookie(this.cookieName, this.cookieOptions);
  }
}
