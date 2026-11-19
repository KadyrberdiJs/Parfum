import { ConflictException, NotFoundException } from '@nestjs/common';
import { createHash } from 'crypto';
import { Prisma } from '../../../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CartService } from './cart.service';
import { LoadedCart, LoadedVariant, Selection } from './cart.types';
import { presentCart } from './cart-stock';

const guestToken = 'a'.repeat(64);
const guestTokenHash = createHash('sha256').update(guestToken).digest('hex');
function variant(
  id: number,
  ml: number,
  stockMl = 40,
  productId = 1,
): LoadedVariant {
  return {
    id,
    ml,
    price: new Prisma.Decimal('0.10'),
    sku: null,
    productId,
    createdAt: new Date(),
    updatedAt: new Date(),
    product: {
      id: productId,
      name: 'Imagination',
      brand: 'Louis Vuitton',
      images: [],
      shopId: 1,
      isActive: true,
      stockMl,
      shop: { name: 'Aroma', status: 'APPROVED' },
    },
  };
}
function cart(
  userId: number | null,
  selection: Selection[] = [],
  variants = [variant(11, 10), variant(12, 30)],
): LoadedCart {
  return {
    id: userId ?? 10,
    userId,
    guestTokenHash: userId ? null : guestTokenHash,
    expiresAt: userId ? null : new Date(Date.now() + 86400000),
    createdAt: new Date(),
    updatedAt: new Date(),
    items: selection.map((item, index) => ({
      id: index + 100,
      cartId: userId ?? 10,
      ...item,
      variant: variants.find((entry) => entry.id === item.variantId)!,
    })),
  };
}

describe('Cart stock checks and account merging', () => {
  const database = {
    cart: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    cartItem: {
      upsert: jest.fn(),
      update: jest.fn(),
      deleteMany: jest.fn(),
      createMany: jest.fn(),
    },
    productVariant: { findMany: jest.fn() },
    $transaction: jest.fn(),
  };
  let service: CartService;
  let variants: LoadedVariant[];
  beforeEach(() => {
    jest.resetAllMocks();
    variants = [variant(11, 10), variant(12, 30), variant(21, 20, 200, 2)];
    database.$transaction.mockImplementation(
      (operation: (transaction: unknown) => Promise<unknown>) =>
        operation(database),
    );
    database.cart.findUnique.mockResolvedValue(cart(1));
    database.cart.update.mockResolvedValue(cart(1));
    database.productVariant.findMany.mockImplementation(
      (args: { where: { id: { in: number[] } } }) =>
        Promise.resolve(
          variants.filter((entry) => args.where.id.in.includes(entry.id)),
        ),
    );
    service = new CartService(database as unknown as PrismaService);
  });

  it('returns an empty guest cart without creating a database row', async () => {
    await expect(service.read({})).resolves.toMatchObject({
      id: null,
      items: [],
      total: '0.00',
    });
    expect(database.cart.create).not.toHaveBeenCalled();
    expect(database.cart.findUnique).not.toHaveBeenCalled();
  });
  it('creates a server-generated guest token and stores only its hash', async () => {
    database.cart.findUnique.mockResolvedValue(null);
    database.cart.create.mockResolvedValue(cart(null));
    database.cart.update.mockResolvedValue(
      cart(null, [{ variantId: 11, quantity: 2 }]),
    );
    const result = await service.add(
      { guestToken: 'untrusted-client-value' },
      { variantId: 11, quantity: 2 },
    );
    expect(result.guestToken).toMatch(/^[a-f0-9]{64}$/);
    expect(database.cart.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          guestTokenHash: createHash('sha256')
            .update(result.guestToken!)
            .digest('hex'),
          expiresAt: expect.any(Date) as unknown,
        },
      }),
    );
    expect(JSON.stringify(result.cart)).not.toContain(result.guestToken);
    expect(result.cart.items[0].quantity).toBe(2);
  });
  it('rejects 20 ml already in cart plus a new 30 ml size when only 40 ml remain', async () => {
    database.cart.findUnique.mockResolvedValue(
      cart(1, [{ variantId: 11, quantity: 2 }]),
    );
    try {
      await service.add({ userId: 1 }, { variantId: 12, quantity: 1 });
      throw new Error('Expected a conflict');
    } catch (error) {
      expect(error).toBeInstanceOf(ConflictException);
      expect((error as ConflictException).getResponse()).toMatchObject({
        availableMl: 40,
        inCartMl: 20,
        remainingToAddMl: 20,
        requestedMl: 50,
      });
    }
    expect(database.cartItem.upsert).not.toHaveBeenCalled();
  });
  it('accepts the exact remaining amount and combines duplicate sizes', async () => {
    database.cart.findUnique.mockResolvedValue(
      cart(1, [{ variantId: 11, quantity: 2 }]),
    );
    await service.add({ userId: 1 }, { variantId: 11, quantity: 2 });
    expect(database.cartItem.upsert).toHaveBeenCalledWith({
      where: { cartId_variantId: { cartId: 1, variantId: 11 } },
      create: { cartId: 1, variantId: 11, quantity: 4 },
      update: { quantity: 4 },
    });
  });
  it('keeps different perfumes in separate stock pools', async () => {
    database.cart.findUnique.mockResolvedValue(
      cart(1, [{ variantId: 11, quantity: 4 }]),
    );
    await expect(
      service.add({ userId: 1 }, { variantId: 21, quantity: 3 }),
    ).resolves.toBeDefined();
  });
  it.each(['inactive', 'suspended', 'deleted'])(
    'rejects an %s product/variant',
    async (state) => {
      if (state === 'inactive') variants[0].product.isActive = false;
      if (state === 'suspended') variants[0].product.shop.status = 'SUSPENDED';
      if (state === 'deleted') variants = [];
      await expect(
        service.add({ userId: 1 }, { variantId: 11, quantity: 1 }),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(database.cartItem.upsert).not.toHaveBeenCalled();
    },
  );
  it('checks increases but allows users to reduce an already stale cart', async () => {
    database.cart.findUnique.mockResolvedValue(
      cart(1, [{ variantId: 11, quantity: 3 }], [variant(11, 10, 10)]),
    );
    variants[0].product.stockMl = 10;
    await expect(
      service.setQuantity({ userId: 1 }, 100, 4),
    ).rejects.toBeInstanceOf(ConflictException);
    await expect(
      service.setQuantity({ userId: 1 }, 100, 2),
    ).resolves.toBeDefined();
    expect(database.cartItem.update).toHaveBeenCalledTimes(1);
  });
  it('never updates an item outside the resolved cart', async () => {
    await expect(
      service.setQuantity({ userId: 1 }, 999, 1),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(database.cartItem.update).not.toHaveBeenCalled();
    database.cartItem.deleteMany.mockResolvedValue({ count: 0 });
    await expect(service.remove({ userId: 1 }, 999)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(database.cartItem.deleteMany).toHaveBeenCalledWith({
      where: { id: 999, cartId: 1 },
    });
  });
  it('resolves guest carts by hash, expiry and guest ownership', async () => {
    database.cart.findUnique.mockResolvedValue(null);
    await service.read({ guestToken });
    expect(database.cart.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          guestTokenHash,
          AND: { userId: null },
          expiresAt: { gt: expect.any(Date) as unknown },
        },
      }),
    );
    await expect(
      service.setQuantity({ guestToken }, 100, 1),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
  it('rejects excessive quantities before any write', async () => {
    await expect(
      service.add({ userId: 1 }, { variantId: 11, quantity: 100 }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(database.cartItem.upsert).not.toHaveBeenCalled();
  });
  it('preserves both carts when a merge exceeds shared stock', async () => {
    database.cart.findUnique
      .mockResolvedValueOnce(cart(null, [{ variantId: 12, quantity: 1 }]))
      .mockResolvedValueOnce(cart(1, [{ variantId: 11, quantity: 2 }]));
    await expect(service.merge(1, guestToken)).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(database.cartItem.deleteMany).not.toHaveBeenCalled();
    expect(database.cart.delete).not.toHaveBeenCalled();
    expect(database.cart.update).not.toHaveBeenCalled();
  });
  it('combines quantities and consumes a successfully merged guest cart once', async () => {
    database.cart.findUnique
      .mockResolvedValueOnce(cart(null, [{ variantId: 11, quantity: 2 }]))
      .mockResolvedValueOnce(cart(1, [{ variantId: 11, quantity: 1 }]));
    await service.merge(1, guestToken);
    expect(database.cartItem.createMany).toHaveBeenCalledWith({
      data: [{ cartId: 1, variantId: 11, quantity: 3 }],
    });
    expect(database.cart.delete).toHaveBeenCalledWith({
      where: { id: 10, AND: { userId: null } },
    });
    database.cart.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(cart(1, [{ variantId: 11, quantity: 3 }]));
    await service.merge(1, guestToken);
    expect(database.cartItem.createMany).toHaveBeenCalledTimes(1);
  });
  it('claims a guest cart when the account has no cart, removing guest access', async () => {
    database.cart.findUnique
      .mockResolvedValueOnce(cart(null, [{ variantId: 11, quantity: 1 }]))
      .mockResolvedValueOnce(null);
    await service.merge(1, guestToken);
    expect(database.cart.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 10, AND: { userId: null } },
        data: { userId: 1, guestTokenHash: null, expiresAt: null },
      }),
    );
  });
  it('retries serializable conflicts without letting parallel additions bypass validation', async () => {
    database.$transaction.mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError('retry', {
        code: 'P2034',
        clientVersion: '7',
      }),
    );
    database.cart.findUnique.mockResolvedValue(
      cart(1, [{ variantId: 11, quantity: 4 }]),
    );
    await expect(
      service.add({ userId: 1 }, { variantId: 11, quantity: 1 }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(database.$transaction).toHaveBeenCalledTimes(2);
    expect(database.cartItem.upsert).not.toHaveBeenCalled();
  });
  it('shows live prices and stock conflicts without modifying the cart', () => {
    const view = presentCart(
      cart(1, [
        { variantId: 11, quantity: 3 },
        { variantId: 12, quantity: 1 },
      ]),
    );
    expect(view.total).toBe('0.40');
    expect(view.items[0]).toMatchObject({
      lineTotal: '0.30',
      availableMl: 40,
      inCartMl: 60,
      remainingToAddMl: 0,
      available: false,
    });
    expect(view.hasAvailabilityIssues).toBe(true);
  });
});
