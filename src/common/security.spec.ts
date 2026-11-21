import {
  BadRequestException,
  ExecutionContext,
  UnauthorizedException,
  ValidationPipe,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { JwtAuthGuard } from '../modules/auth/guards/jwt-auth.guard';
import { RolesGuard } from '../modules/auth/guards/roles.guard';
import { Roles } from './decorators/roles.decorator';
import { Public } from './decorators/public.decorator';
import { JwtStrategy } from '../modules/auth/strategies/jwt-strategies';
import { PrismaService } from '../modules/prisma/prisma.service';
import { UpdateProductDto } from '../modules/product/dto/update-product.dto';
import { CreateProductDto } from '../modules/product/dto/create-product.dto';
import { UpdateUserDto } from '../modules/users/dto/update-user.dto';
import { CreateShopDto } from '../modules/shop/dto/create-shop.dto';
import { StockMovementDto } from '../modules/product/dto/stock-movement.dto';
import { StockSaleDto } from '../modules/product/dto/stock-sale.dto';
import { PaginationDto } from './pagination.dto';
import { buildRedisConnection, validateEnvironment } from './config';
@Roles('SUPER_ADMIN')
class RestrictedController {}
@Public()
class PublicController {}
const context = (controller: object, user?: object) =>
  ({
    getHandler: () => () => undefined,
    getClass: () => controller,
    switchToHttp: () => ({
      getRequest: () => ({ headers: {}, user }),
      getResponse: () => ({}),
    }),
  }) as unknown as ExecutionContext;
describe('Authentication and authorization', () => {
  const reflector = new Reflector();
  it('requires authentication unless explicitly public', async () => {
    // Register Passport's real strategy without starting an HTTP server.
    new JwtStrategy(
      {} as PrismaService,
      new ConfigService({ JWT_SECRET: 'test-secret' }),
    );
    const guard = new JwtAuthGuard(reflector);
    expect(guard.canActivate(context(PublicController))).toBe(true);
    await expect(
      guard.canActivate(context(RestrictedController)),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });
  it('rejects absent and incorrect roles', () => {
    const guard = new RolesGuard(reflector);
    expect(guard.canActivate(context(RestrictedController))).toBe(false);
    expect(
      guard.canActivate(context(RestrictedController, { role: 'CUSTOMER' })),
    ).toBe(false);
    expect(
      guard.canActivate(context(RestrictedController, { role: 'SUPER_ADMIN' })),
    ).toBe(true);
  });
  it('returns the current database identity and rejects inactive or missing users', async () => {
    const findUnique = jest.fn().mockResolvedValue({
      id: 1,
      username: 'current',
      role: 'CUSTOMER',
      isActive: true,
    });
    const strategy = new JwtStrategy(
      { user: { findUnique } } as unknown as PrismaService,
      new ConfigService({ JWT_SECRET: 'test-secret' }),
    );
    await expect(
      strategy.validate({ sub: 1, type: 'access' }),
    ).resolves.toEqual({
      id: 1,
      username: 'current',
      role: 'CUSTOMER',
    });
    findUnique.mockResolvedValue({ isActive: false });
    await expect(
      strategy.validate({ sub: 1, type: 'access' }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    findUnique.mockResolvedValue(null);
    await expect(
      strategy.validate({ sub: 1, type: 'access' }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
describe('Request validation', () => {
  const pipe = new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  });
  it.each([
    [StockMovementDto, { type: 'REFILL', deltaMl: 0, note: 'test' }],
    [StockMovementDto, { type: 'CORRECTION', deltaMl: 10, note: '   ' }],
    [StockMovementDto, { type: 'REFILL', deltaMl: 1.5, note: 'test' }],
    [StockSaleDto, { items: [{ variantId: 1, quantity: 0 }], note: 'test' }],
    [UpdateProductDto, { stockMl: 100 }],
    [UpdateProductDto, { shopId: 9 }],
    [UpdateProductDto, { name: null }],
    [UpdateProductDto, { isActive: null }],
    [UpdateProductDto, { variants: { create: null } }],
    [UpdateProductDto, { variants: { update: [{ id: 1, stock: null }] } }],
    [UpdateUserDto, { password: 'replacement' }],
    [
      CreateShopDto,
      { name: 'Shop', slug: 'shop', email: 'shop@example.com', ownerId: 9 },
    ],
    [
      CreateProductDto,
      {
        name: 'Perfume',
        slug: 'perfume',
        shopId: 1,
        categoryId: 1,
        variants: [{ ml: 0, price: -1 }],
      },
    ],
  ])('rejects invalid %p input %p', async (metatype, value) => {
    await expect(
      pipe.transform(value, { type: 'body', metatype }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
  it('transforms and bounds pagination', async () => {
    const result: unknown = await pipe.transform(
      { page: '2', limit: '10' },
      { type: 'query', metatype: PaginationDto },
    );
    expect(result).toMatchObject({ page: 2, limit: 10 });
    await expect(
      pipe.transform(
        { limit: '101' },
        { type: 'query', metatype: PaginationDto },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
  it('validates the single JWT secret and optional Redis URL', () => {
    expect(() => validateEnvironment({})).toThrow('DATABASE_URL');
    expect(() =>
      validateEnvironment({
        DATABASE_URL: 'postgresql://localhost/test',
        JWT_SECRET: 'short',
      }),
    ).toThrow('at least 32');
    expect(() =>
      validateEnvironment({
        DATABASE_URL: 'postgresql://localhost/test',
        JWT_SECRET: 'x'.repeat(32),
        REDIS_URL: 'http://localhost:6379',
      }),
    ).toThrow('Redis URL');
    expect(() =>
      validateEnvironment({
        DATABASE_URL: 'postgresql://localhost/test',
        JWT_SECRET: 'x'.repeat(32),
        REDIS_URL: 'redis://localhost:6379/2',
      }),
    ).not.toThrow();
    expect(
      buildRedisConnection('rediss://user:pass@redis.local:6380/2'),
    ).toEqual({
      host: 'redis.local',
      port: 6380,
      username: 'user',
      password: 'pass',
      db: 2,
      tls: {},
    });
  });
});
