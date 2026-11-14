import { UnauthorizedException } from '@nestjs/common';
import bcrypt from 'bcryptjs';
import { UsersService } from './users.service';
import { PrismaService } from '../prisma/prisma.service';
describe('UsersService password changes', () => {
  const db = {
    user: { findUnique: jest.fn(), updateMany: jest.fn() },
    refreshToken: { deleteMany: jest.fn() },
    $transaction: jest.fn(),
  };
  let service: UsersService;
  beforeEach(() => {
    jest.resetAllMocks();
    db.$transaction.mockImplementation(
      (fn: (tx: unknown) => Promise<unknown>) => fn(db),
    );
    service = new UsersService(db as unknown as PrismaService);
  });
  it('rejects an incorrect current password', async () => {
    db.user.findUnique.mockResolvedValue({
      password: await bcrypt.hash('original', 4),
      isActive: true,
    });
    await expect(
      service.changePassword(1, {
        currentPassword: 'wrong',
        newPassword: 'replacement',
      }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(db.user.updateMany).not.toHaveBeenCalled();
  });
  it('hashes the new password and revokes refresh sessions atomically', async () => {
    db.user.findUnique.mockResolvedValue({
      password: await bcrypt.hash('original', 4),
      isActive: true,
    });
    db.user.updateMany.mockImplementation(
      async (args: { data: { password: string } }) => {
        expect(await bcrypt.compare('replacement', args.data.password)).toBe(
          true,
        );
        return { count: 1 };
      },
    );
    await service.changePassword(1, {
      currentPassword: 'original',
      newPassword: 'replacement',
    });
    expect(db.refreshToken.deleteMany).toHaveBeenCalledWith({
      where: { userId: 1 },
    });
  });
});
