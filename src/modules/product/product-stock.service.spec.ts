import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { ProductStockService } from './product-stock.service';
import { PrismaService } from '../prisma/prisma.service';
import { PaginationDto } from '../../common/pagination.dto';
import { StockMovementType } from '../../../generated/prisma/enums';
const user = { id: 7, username: 'owner', role: 'ADMIN' as const };
describe('Shared perfume stock', () => {
  const db = {
    product: {
      findFirst: jest.fn(),
      updateMany: jest.fn(),
      findUniqueOrThrow: jest.fn(),
    },
    productVariant: { findMany: jest.fn() },
    stockMovement: { create: jest.fn(), findMany: jest.fn() },
    $transaction: jest.fn(),
  };
  let service: ProductStockService;
  beforeEach(() => {
    jest.resetAllMocks();
    db.$transaction.mockImplementation(
      (fn: (tx: unknown) => Promise<unknown>) => fn(db),
    );
    db.product.findFirst.mockResolvedValue({ id: 1 });
    db.product.updateMany.mockResolvedValue({ count: 1 });
    db.product.findUniqueOrThrow.mockResolvedValue({ stockMl: 450 });
    db.productVariant.findMany.mockResolvedValue([
      { id: 11, ml: 10 },
      { id: 12, ml: 30 },
    ]);
    service = new ProductStockService(db as unknown as PrismaService);
  });
  it('deducts combined ml from all sizes, including repeated items', async () => {
    await service.sell(
      1,
      {
        items: [
          { variantId: 11, quantity: 1 },
          { variantId: 12, quantity: 1 },
          { variantId: 11, quantity: 1 },
        ],
        note: 'Counter sale',
      },
      user,
    );
    expect(db.product.updateMany).toHaveBeenCalledWith({
      where: { id: 1, shop: { ownerId: 7 }, stockMl: { gte: 50 } },
      data: { stockMl: { increment: -50 } },
    });
    expect(db.stockMovement.create).toHaveBeenCalledWith({
      data: {
        productId: 1,
        type: 'SALE',
        deltaMl: -50,
        balanceMl: 450,
        actorId: 7,
        note: 'Counter sale',
      },
    });
  });
  it('rejects an entire mixed-size sale when the combined amount exceeds stock', async () => {
    db.product.updateMany.mockResolvedValue({ count: 0 });
    await expect(
      service.sell(
        1,
        {
          items: [
            { variantId: 11, quantity: 2 },
            { variantId: 12, quantity: 1 },
          ],
          note: 'Only 40 ml left',
        },
        user,
      ),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(db.stockMovement.create).not.toHaveBeenCalled();
  });
  it('rejects variants from another product', async () => {
    db.productVariant.findMany.mockResolvedValue([]);
    await expect(
      service.sell(
        1,
        { items: [{ variantId: 99, quantity: 1 }], note: 'Sale' },
        user,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(db.product.updateMany).not.toHaveBeenCalled();
  });
  it('rejects nonowners before changing stock or reading history', async () => {
    db.product.findFirst.mockResolvedValue(null);
    await expect(
      service.adjust(1, { type: 'REFILL', deltaMl: 100, note: 'Refill' }, user),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      service.history(1, user, new PaginationDto()),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(db.product.updateMany).not.toHaveBeenCalled();
    expect(db.stockMovement.findMany).not.toHaveBeenCalled();
  });
  it.each<[StockMovementType, number]>([
    ['REFILL', -1],
    ['RETURN', -1],
    ['SALE', 1],
    ['SPILLAGE', 1],
    ['CORRECTION', 0],
  ])('rejects incorrect direction for %s', (type, deltaMl) => {
    expect(() =>
      service.adjust(1, { type, deltaMl, note: 'test' }, user),
    ).toThrow(BadRequestException);
    expect(db.$transaction).not.toHaveBeenCalled();
  });
  it('checks overflow and records refills', async () => {
    await service.adjust(
      1,
      { type: 'REFILL', deltaMl: 100, note: 'New bottle' },
      user,
    );
    expect(db.product.updateMany).toHaveBeenCalledWith({
      where: { id: 1, shop: { ownerId: 7 }, stockMl: { lte: 2147483547 } },
      data: { stockMl: { increment: 100 } },
    });
  });
  it('propagates ledger failures to roll back the transaction', async () => {
    db.stockMovement.create.mockRejectedValue(new Error('Ledger unavailable'));
    await expect(
      service.adjust(1, { type: 'SPILLAGE', deltaMl: -5, note: 'Spill' }, user),
    ).rejects.toThrow('Ledger unavailable');
  });
});
