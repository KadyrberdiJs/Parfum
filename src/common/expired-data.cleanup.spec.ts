import { ExpiredDataCleanup } from './expired-data.cleanup';
import { PrismaService } from '../modules/prisma/prisma.service';

describe('ExpiredDataCleanup', () => {
  it('deletes expired refresh tokens and expired guest carts', async () => {
    const refreshToken = { deleteMany: jest.fn().mockResolvedValue({}) };
    const cart = { deleteMany: jest.fn().mockResolvedValue({}) };
    const cleanup = new ExpiredDataCleanup({
      refreshToken,
      cart,
    } as unknown as PrismaService);

    await cleanup.onApplicationBootstrap();
    cleanup.onModuleDestroy();

    expect(refreshToken.deleteMany).toHaveBeenCalledWith({
      where: { expiresAt: { lt: expect.any(Date) as unknown } },
    });
    expect(cart.deleteMany).toHaveBeenCalledWith({
      where: { userId: null, expiresAt: { lt: expect.any(Date) as unknown } },
    });
  });
});
