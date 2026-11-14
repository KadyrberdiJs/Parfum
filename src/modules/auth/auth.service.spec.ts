import { UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { AuthService } from './auth.service';
import { UsersService } from '../users/users.service';
import { PrismaService } from '../prisma/prisma.service';
import { createHash } from 'crypto';
describe('AuthService sessions', () => {
  const user = { id: 1, username: 'user', role: 'CUSTOMER', isActive: true };
  const db = {
    user: { findUnique: jest.fn() },
    refreshToken: { deleteMany: jest.fn(), create: jest.fn() },
    $transaction: jest.fn(),
  };
  const users = { findByUserName: jest.fn() };
  const jwt = { signAsync: jest.fn() };
  let service: AuthService;
  beforeEach(() => {
    jest.resetAllMocks();
    db.user.findUnique.mockResolvedValue(user);
    db.refreshToken.deleteMany.mockResolvedValue({ count: 1 });
    db.$transaction.mockImplementation(
      (fn: (tx: unknown) => Promise<unknown>) => fn(db),
    );
    jwt.signAsync.mockResolvedValue('new-token');
    service = new AuthService(
      users as unknown as UsersService,
      jwt as unknown as JwtService,
      db as unknown as PrismaService,
    );
  });
  it('rejects inactive login accounts before issuing tokens', async () => {
    users.findByUserName.mockResolvedValue({ ...user, isActive: false });
    await expect(
      service.login({ username: 'user', password: 'password' }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(jwt.signAsync).not.toHaveBeenCalled();
  });
  it('rejects inactive accounts during refresh', async () => {
    db.user.findUnique.mockResolvedValue({ ...user, isActive: false });
    await expect(service.refresh(1, 'token')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(db.refreshToken.create).not.toHaveBeenCalled();
  });
  it('rejects missing, expired or previously consumed refresh tokens', async () => {
    db.refreshToken.deleteMany.mockResolvedValue({ count: 0 });
    await expect(service.refresh(1, 'token')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(db.refreshToken.create).not.toHaveBeenCalled();
  });
  it('consumes a valid token and persists its replacement in one transaction', async () => {
    await expect(service.refresh(1, 'token')).resolves.toEqual({
      accessToken: 'new-token',
      refreshToken: 'new-token',
    });
    const dateMatcher: unknown = expect.any(Date);
    expect(db.refreshToken.deleteMany).toHaveBeenCalledWith({
      where: {
        tokenHash: createHash('sha256').update('token').digest('hex'),
        userId: 1,
        expiresAt: { gt: dateMatcher },
      },
    });
    expect(db.refreshToken.create).toHaveBeenCalledTimes(1);
    expect(db.$transaction).toHaveBeenCalledTimes(1);
  });
  it('propagates replacement failure so the transaction can roll back', async () => {
    db.refreshToken.create.mockRejectedValue(new Error('database unavailable'));
    await expect(service.refresh(1, 'token')).rejects.toThrow(
      'database unavailable',
    );
  });
  it('logs out using the hash of the supplied refresh token', async () => {
    await service.logout('token');
    expect(db.refreshToken.deleteMany).toHaveBeenCalledWith({
      where: { tokenHash: createHash('sha256').update('token').digest('hex') },
    });
  });
});
