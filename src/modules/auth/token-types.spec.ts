import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { AuthService } from './auth.service';
import { JwtStrategy } from './strategies/jwt-strategies';
import { RefreshStrategy } from './strategies/refresh-strategies';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RefreshAuthGuard } from './guards/refresh-auth.guard';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from '../users/users.service';

const secret = 'single-test-signing-secret-at-least-32-characters';
const jwt = new JwtService({ secret, signOptions: { expiresIn: '15m' } });
const config = new ConfigService({ JWT_SECRET: secret });
function context(token: string): ExecutionContext {
  const request = { headers: { authorization: `Bearer ${token}` } };
  return {
    getHandler: () => context,
    getClass: () => JwtAuthGuard,
    switchToHttp: () => ({
      getRequest: () => request,
      getResponse: () => ({}),
    }),
  } as unknown as ExecutionContext;
}

describe('Single-secret token separation', () => {
  const db = {
    user: { findUnique: jest.fn() },
    refreshToken: { deleteMany: jest.fn(), create: jest.fn() },
    $transaction: jest.fn(),
  };
  const accessGuard = new JwtAuthGuard(new Reflector());
  const refreshGuard = new RefreshAuthGuard();
  beforeEach(() => {
    jest.resetAllMocks();
    db.user.findUnique.mockResolvedValue({
      id: 1,
      username: 'test',
      role: 'CUSTOMER',
      isActive: true,
    });
    db.refreshToken.deleteMany.mockResolvedValue({ count: 1 });
    db.$transaction.mockImplementation(
      (fn: (tx: unknown) => Promise<unknown>) => fn(db),
    );
    new JwtStrategy(db as unknown as PrismaService, config);
    new RefreshStrategy(config);
  });
  it('issues both types with the same secret and distinct lifetimes', async () => {
    const service = new AuthService(
      {} as UsersService,
      jwt,
      db as unknown as PrismaService,
    );
    const tokens = await service.refresh(1, 'stored-token');
    const access = jwt.verify<{ type: string; exp: number; iat: number }>(
      tokens.accessToken,
    );
    const refresh = jwt.verify<{
      type: string;
      exp: number;
      iat: number;
      jti: string;
    }>(tokens.refreshToken);
    expect(access.type).toBe('access');
    expect(refresh.type).toBe('refresh');
    expect(access.exp - access.iat).toBe(15 * 60);
    expect(refresh.exp - refresh.iat).toBe(30 * 24 * 60 * 60);
    expect(refresh.jti).toEqual(expect.any(String));
    await expect(
      accessGuard.canActivate(context(tokens.accessToken)),
    ).resolves.toBe(true);
    await expect(
      refreshGuard.canActivate(context(tokens.refreshToken)),
    ).resolves.toBe(true);
  });
  it('rejects refresh tokens on access routes before loading a user', async () => {
    const token = jwt.sign({ sub: 1, type: 'refresh' });
    await expect(
      accessGuard.canActivate(context(token)),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(db.user.findUnique).not.toHaveBeenCalled();
  });
  it('rejects access tokens on refresh/logout routes', async () => {
    const token = jwt.sign({ sub: 1, type: 'access' });
    await expect(
      refreshGuard.canActivate(context(token)),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });
  it.each([undefined, 'unknown'])(
    'rejects missing or unknown type: %s',
    async (type) => {
      const token = jwt.sign({ sub: 1, type });
      await expect(
        accessGuard.canActivate(context(token)),
      ).rejects.toBeInstanceOf(UnauthorizedException);
      await expect(
        refreshGuard.canActivate(context(token)),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    },
  );
  it.each(['access', 'refresh'])(
    'still rejects expired and incorrectly signed %s tokens',
    async (type) => {
      const guard = type === 'access' ? accessGuard : refreshGuard;
      const expired = jwt.sign({ sub: 1, type }, { expiresIn: -1 });
      const forged = jwt.sign({ sub: 1, type }, { secret: 'different-secret' });
      await expect(guard.canActivate(context(expired))).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
      await expect(guard.canActivate(context(forged))).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    },
  );
});
