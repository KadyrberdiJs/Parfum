import { BadRequestException } from '@nestjs/common';
import { CategoryService } from './category.service';
import { PrismaService } from '../prisma/prisma.service';
describe('CategoryService hierarchy', () => {
  it('rejects indirect cycles before updating', async () => {
    const db = {
      category: {
        findUnique: jest.fn().mockResolvedValue({ parentId: 1 }),
        update: jest.fn(),
      },
      $transaction: jest.fn(),
    };
    db.$transaction.mockImplementation(
      (fn: (tx: unknown) => Promise<unknown>) => fn(db),
    );
    const service = new CategoryService(db as unknown as PrismaService);
    await expect(service.update(1, { parentId: 2 })).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(db.category.update).not.toHaveBeenCalled();
  });
});
