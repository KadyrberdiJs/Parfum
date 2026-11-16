import {
  BadRequestException,
  ExecutionContext,
  ForbiddenException,
  UnauthorizedException,
  ValidationPipe,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import type { Request, Response } from 'express';
import { OptionalAuth } from '../../common/decorators/optional-auth.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { JwtStrategy } from '../auth/strategies/jwt-strategies';
import { PrismaService } from '../prisma/prisma.service';
import { CartRequestGuard } from './cart-request.guard';
import { CartSession, type CartRequest } from './cart-session';
import { CartController } from './cart.controller';
import { CartService } from './cart.service';
import { AddCartItemDto } from './dto/cart-item.dto';

@OptionalAuth()
class OptionalController {
  @OptionalAuth(false)
  merge(this: void) {}
}
function context(
  headers: Record<string, string> = {},
  method = 'POST',
  handler: () => void = () => undefined,
): ExecutionContext {
  const request = {
    headers,
    method,
    protocol: 'https',
    ip: '127.0.0.1',
    socket: {},
    get: (name: string) => headers[name.toLowerCase()],
  };
  return {
    getHandler: () => handler,
    getClass: () => OptionalController,
    switchToHttp: () => ({
      getRequest: () => request,
      getResponse: () => ({ setHeader: jest.fn() }),
    }),
  } as unknown as ExecutionContext;
}

describe('Cart authentication and browser boundaries', () => {
  const secret = 'cart-test-secret-at-least-32-characters';
  const config = new ConfigService({
    JWT_SECRET: secret,
    CART_ALLOWED_ORIGINS: 'https://shop.example.com',
  });
  beforeEach(() => {
    new JwtStrategy(
      {
        user: {
          findUnique: jest.fn().mockResolvedValue({
            id: 1,
            username: 'customer',
            role: 'CUSTOMER',
            isActive: true,
          }),
        },
      } as unknown as PrismaService,
      config,
    );
  });
  it('allows guests but does not downgrade invalid or expired login tokens', async () => {
    const guard = new JwtAuthGuard(new Reflector());
    expect(guard.canActivate(context())).toBe(true);
    const jwt = new JwtService({ secret });
    const expired = jwt.sign({ sub: 1, type: 'access' }, { expiresIn: -1 });
    for (const token of [
      'invalid',
      expired,
      jwt.sign({ sub: 1, type: 'refresh' }),
    ]) {
      await expect(
        guard.canActivate(context({ authorization: `Bearer ${token}` })),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    }
    await expect(
      guard.canActivate(
        context({
          authorization: `Bearer ${jwt.sign({ sub: 1, type: 'access' })}`,
        }),
      ),
    ).resolves.toBe(true);
  });
  it('requires login on merge despite controller-level optional authentication', async () => {
    const guard = new JwtAuthGuard(new Reflector());
    await expect(
      guard.canActivate(
        context({}, 'POST', OptionalController.prototype.merge),
      ),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });
  it('rejects simple cross-origin writes and untrusted origins', () => {
    const guard = new CartRequestGuard(config);
    expect(() =>
      guard.canActivate(context({ host: 'api.example.com' })),
    ).toThrow(ForbiddenException);
    expect(() =>
      guard.canActivate(
        context({
          host: 'api.example.com',
          'x-cart-request': '1',
          origin: 'https://evil.example',
        }),
      ),
    ).toThrow(ForbiddenException);
    expect(
      guard.canActivate(
        context({
          host: 'api.example.com',
          'x-cart-request': '1',
          origin: 'https://shop.example.com',
        }),
      ),
    ).toBe(true);
    expect(guard.canActivate(context({ host: 'api.example.com' }, 'GET'))).toBe(
      true,
    );
  });
  it('sets production guest cookies as host-only, secure, HttpOnly and SameSite Lax', () => {
    const session = new CartSession(
      new ConfigService({ NODE_ENV: 'production' }),
    );
    const response = {
      cookie: jest.fn(),
      clearCookie: jest.fn(),
      setHeader: jest.fn(),
    };
    session.save(response as unknown as Response, 'a'.repeat(64));
    expect(response.cookie).toHaveBeenCalledWith(
      '__Host-guest_cart',
      'a'.repeat(64),
      {
        httpOnly: true,
        secure: true,
        sameSite: 'lax',
        path: '/',
        maxAge: 2592000000,
      },
    );
    session.clear(response as unknown as Response);
    expect(response.clearCookie).toHaveBeenCalledWith('__Host-guest_cart', {
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      path: '/',
    });
  });
  it('prefers authenticated identity and rejects malformed guest cookies', () => {
    const session = new CartSession(new ConfigService());
    const request = {
      headers: { cookie: `guest_cart=${'a'.repeat(64)}` },
      user: { id: 1, username: 'user', role: 'CUSTOMER' as const },
    } as Request & { user: { id: number; username: string; role: 'CUSTOMER' } };
    expect(session.identity(request)).toEqual({ userId: 1 });
    expect(
      session.guestToken({
        headers: { cookie: 'guest_cart=guess' },
      } as Request),
    ).toBeUndefined();
  });
  it('keeps the guest cookie when merging fails, and clears it only on success', async () => {
    const merge = jest.fn().mockRejectedValue(new Error('Stock conflict'));
    const clear = jest.fn();
    const controller = new CartController(
      { merge } as unknown as CartService,
      { guestToken: () => 'a'.repeat(64), clear } as unknown as CartSession,
    );
    const user = { id: 1, username: 'user', role: 'CUSTOMER' as const };
    await expect(
      controller.merge(user, {} as CartRequest, {} as Response),
    ).rejects.toThrow('Stock conflict');
    expect(clear).not.toHaveBeenCalled();
    merge.mockResolvedValue({ items: [] });
    await controller.merge(user, {} as CartRequest, {} as Response);
    expect(clear).toHaveBeenCalledTimes(1);
  });
  it.each([
    { variantId: 1, quantity: 0 },
    { variantId: 1, quantity: 1.5 },
    { variantId: 1, quantity: 100 },
    { variantId: 1, quantity: 1, userId: 2 },
    { variantId: 1, quantity: 1, price: 0 },
  ])('rejects invalid cart input %p', async (body) => {
    const pipe = new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    });
    await expect(
      pipe.transform(body, { type: 'body', metatype: AddCartItemDto }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
