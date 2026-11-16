import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { Prisma } from '../../../generated/prisma/client';
import { ProductService } from './product.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '../../common/decorators/current-user.decorator';
const user: AuthUser = { id: 1, username: 'seller', role: 'ADMIN' };
const dto = {
  name: 'Perfume',
  slug: 'perfume',
  shopId: 2,
  categoryId: 3,
  variants: [{ ml: 50, price: 20 }],
};
describe('ProductService permissions and invariants', () => {
  const db = {
    shop: { findFirst: jest.fn() },
    product: {
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
    },
    $transaction: jest.fn(),
  };
  let service: ProductService;
  beforeEach(() => {
    jest.resetAllMocks();
    db.product.findMany.mockResolvedValue([]);
    db.$transaction.mockImplementation(
      (fn: (tx: unknown) => Promise<unknown>) => fn(db),
    );
    service = new ProductService(db as unknown as PrismaService);
  });
  it('waits for ownership lookup and rejects a different shop', async () => {
    db.shop.findFirst.mockResolvedValue(null);
    await expect(service.create(dto, user)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(db.product.create).not.toHaveBeenCalled();
  });
  it('creates nested variants after checking the owner', async () => {
    db.shop.findFirst.mockResolvedValue({ id: 2 });
    await service.create(dto, user);
    expect(db.shop.findFirst).toHaveBeenCalledWith({
      where: { id: 2, ownerId: 1 },
    });
    expect(db.product.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          ...dto,
          stockMl: 0,
          stockMovements: undefined,
          variants: { create: dto.variants },
        },
      }),
    );
  });
  it('records initial stock in the same nested creation', async () => {
    db.shop.findFirst.mockResolvedValue({ id: 2 });
    await service.create({ ...dto, stockMl: 500 }, user);
    expect(db.product.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          ...dto,
          stockMl: 500,
          variants: { create: dto.variants },
          stockMovements: {
            create: {
              type: 'REFILL',
              deltaMl: 500,
              balanceMl: 500,
              actorId: 1,
              note: 'Initial stock',
            },
          },
        },
      }),
    );
  });
  it('scopes update and deletion to the current owner', async () => {
    db.product.update.mockResolvedValue({ variants: [{ id: 9 }] });
    await service.update(5, { name: 'New name' }, user);
    await service.remove(5, user);
    const where = { id: 5, AND: [{ shop: { ownerId: 1 } }] };
    expect(db.product.update).toHaveBeenCalledWith(
      expect.objectContaining({ where }),
    );
    expect(db.product.delete).toHaveBeenCalledWith({ where });
  });
  it('rejects removing the last variant inside a serializable transaction', async () => {
    db.product.update.mockResolvedValue({ variants: [] });
    await expect(
      service.update(5, { variants: { delete: [9] } }, user),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(db.$transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    });
  });
  it('keeps variant selectors scoped by the nested relation', async () => {
    db.product.update.mockResolvedValue({ variants: [{ id: 9 }] });
    await service.update(
      5,
      { variants: { update: [{ id: 9, price: 22 }] } },
      user,
    );
    expect(db.product.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          variants: {
            create: undefined,
            delete: undefined,
            update: [{ where: { id: 9 }, data: { price: 22 } }],
          },
        },
      }),
    );
  });
  it('uses the same visibility rule for list and detail', async () => {
    db.product.findUnique.mockResolvedValue({
      id: 5,
      stockMl: 40,
      variants: [
        { id: 1, ml: 10 },
        { id: 2, ml: 50 },
      ],
    });
    await service.findAll();
    const product = await service.findOne(5);
    expect(product.variants).toEqual([
      { id: 1, ml: 10, available: true, maxQuantity: 4 },
      { id: 2, ml: 50, available: false, maxQuantity: 0 },
    ]);
    expect(db.product.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 5, isActive: true, shop: { status: 'APPROVED' } },
      }),
    );
    expect(db.product.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { isActive: true, shop: { status: 'APPROVED' } },
        take: 20,
        skip: 0,
      }),
    );
  });
});
