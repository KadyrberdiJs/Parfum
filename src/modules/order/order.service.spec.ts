import {
  BadRequestException,
  ConflictException,
  NotFoundException,
  ValidationPipe,
} from '@nestjs/common';
import {
  FulfillmentType,
  OrderStatus,
  Prisma,
} from '../../../generated/prisma/client';
import { AuthUser } from '../../common/decorators/current-user.decorator';
import { LoadedCart, LoadedVariant } from '../cart/cart.types';
import { PrismaService } from '../prisma/prisma.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { UpdateDeliveryFeeDto } from './dto/update-delivery-fee.dto';
import { OrderService } from './order.service';

const customer: AuthUser = { id: 5, username: 'buyer', role: 'CUSTOMER' };
const seller: AuthUser = { id: 1, username: 'seller', role: 'ADMIN' };

function makeVariant(
  id: number,
  ml: number,
  price: string,
  shopId = 10,
  productId = 100,
  stockMl = 200,
): LoadedVariant {
  return {
    id,
    ml,
    price: new Prisma.Decimal(price),
    sku: `SKU-${id}`,
    productId,
    createdAt: new Date(),
    updatedAt: new Date(),
    product: {
      id: productId,
      name: `Perfume ${productId}`,
      brand: 'Dior',
      images: [{ image: { url: `/uploads/images/${productId}.avif` } }],
      shopId,
      isActive: true,
      stockMl,
      shop: { name: `Shop ${shopId}`, status: 'APPROVED' },
    },
  };
}

function makeCart(
  items: Array<{ variant: LoadedVariant; quantity: number }>,
): LoadedCart {
  return {
    id: 1,
    userId: customer.id,
    guestTokenHash: null,
    expiresAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    items: items.map((entry, index) => ({
      id: index + 1,
      cartId: 1,
      variantId: entry.variant.id,
      quantity: entry.quantity,
      variant: entry.variant,
    })),
  };
}

describe('OrderService checkout, snapshots, delivery fees, and cancellations', () => {
  const db = {
    cart: { findUnique: jest.fn() },
    cartItem: { deleteMany: jest.fn() },
    product: { updateMany: jest.fn(), findUniqueOrThrow: jest.fn() },
    stockMovement: { create: jest.fn() },
    order: {
      create: jest.fn(),
      findMany: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
    },
    $transaction: jest.fn(),
  };
  let service: OrderService;

  beforeEach(() => {
    jest.resetAllMocks();
    db.$transaction.mockImplementation(
      (fn: (tx: unknown) => Promise<unknown>) => fn(db),
    );
    db.product.updateMany.mockResolvedValue({ count: 1 });
    db.product.findUniqueOrThrow.mockResolvedValue({ stockMl: 120 });
    db.order.create.mockImplementation(
      ({
        data,
      }: {
        data: Record<string, unknown> & { items: { create: unknown[] } };
      }) =>
        Promise.resolve({
          id: 77,
          status: OrderStatus.PENDING,
          createdAt: new Date(),
          updatedAt: new Date(),
          ...data,
          items: (data.items.create as Array<Record<string, unknown>>).map(
            (item, idx) => ({
              id: idx + 1,
              orderId: 77,
              ...item,
            }),
          ),
        }),
    );
    service = new OrderService(db as unknown as PrismaService);
  });

  it('splits multi-shop carts into separate shop orders with full item snapshots and 20 TMT delivery fee', async () => {
    const v1 = makeVariant(11, 10, '15.00', 10, 100, 100);
    const v2 = makeVariant(12, 30, '40.00', 10, 100, 100);
    const v3 = makeVariant(21, 50, '80.00', 20, 200, 150);
    db.cart.findUnique.mockResolvedValue(
      makeCart([
        { variant: v1, quantity: 2 },
        { variant: v2, quantity: 1 },
        { variant: v3, quantity: 1 },
      ]),
    );

    const orders = await service.placeOrder(
      { userId: customer.id },
      {
        fullName: 'Kemal',
        phone: '+99365123456',
        fulfillmentType: FulfillmentType.DELIVERY,
        address: 'Magtymguly avenue 12',
        note: 'Call before arrival',
      },
    );

    expect(orders).toHaveLength(2);
    expect(orders[0]).toMatchObject({
      shopId: 10,
      shopName: 'Shop 10',
      fullName: 'Kemal',
      phone: '+99365123456',
      address: 'Magtymguly avenue 12',
      note: 'Call before arrival',
      fulfillmentType: 'DELIVERY',
      itemsTotal: '70.00',
      deliveryFee: '20.00',
      total: '90.00',
      items: [
        {
          productId: 100,
          variantId: 11,
          productName: 'Perfume 100',
          brand: 'Dior',
          imageUrl: '/uploads/images/100.avif',
          sku: 'SKU-11',
          ml: 10,
          quantity: 2,
          unitPrice: '15.00',
          lineTotal: '30.00',
        },
        {
          productId: 100,
          variantId: 12,
          productName: 'Perfume 100',
          brand: 'Dior',
          imageUrl: '/uploads/images/100.avif',
          sku: 'SKU-12',
          ml: 30,
          quantity: 1,
          unitPrice: '40.00',
          lineTotal: '40.00',
        },
      ],
    });
    expect(orders[1]).toMatchObject({
      shopId: 20,
      shopName: 'Shop 20',
      itemsTotal: '80.00',
      deliveryFee: '20.00',
      total: '100.00',
    });

    expect(db.product.updateMany).toHaveBeenCalledWith({
      where: { id: 100, stockMl: { gte: 50 } },
      data: { stockMl: { increment: -50 } },
    });
    expect(db.product.updateMany).toHaveBeenCalledWith({
      where: { id: 200, stockMl: { gte: 50 } },
      data: { stockMl: { increment: -50 } },
    });
    expect(db.stockMovement.create).toHaveBeenCalledTimes(2);
    expect(db.cartItem.deleteMany).toHaveBeenCalledWith({
      where: { cartId: 1 },
    });
  });

  it('sets deliveryFee to 0.00 on PICKUP orders', async () => {
    const v1 = makeVariant(11, 10, '25.00');
    db.cart.findUnique.mockResolvedValue(
      makeCart([{ variant: v1, quantity: 2 }]),
    );

    const [order] = await service.placeOrder(
      { userId: customer.id },
      {
        fullName: 'Kemal',
        phone: '+99365123456',
        fulfillmentType: FulfillmentType.PICKUP,
      },
    );

    expect(order).toMatchObject({
      fulfillmentType: 'PICKUP',
      address: null,
      itemsTotal: '50.00',
      deliveryFee: '0.00',
      total: '50.00',
    });
  });

  it('rejects empty carts and stock conflicts before deducting stock', async () => {
    db.cart.findUnique.mockResolvedValue(null);
    await expect(
      service.placeOrder(
        { userId: customer.id },
        {
          fullName: 'Kemal',
          phone: '+99365123456',
          fulfillmentType: FulfillmentType.PICKUP,
        },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);

    const lowStockVariant = makeVariant(11, 50, '25.00', 10, 100, 30);
    db.cart.findUnique.mockResolvedValue(
      makeCart([{ variant: lowStockVariant, quantity: 1 }]),
    );
    await expect(
      service.placeOrder(
        { userId: customer.id },
        {
          fullName: 'Kemal',
          phone: '+99365123456',
          fulfillmentType: FulfillmentType.PICKUP,
        },
      ),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(db.product.updateMany).not.toHaveBeenCalled();
  });

  it('allows shop owner to adjust delivery fee (20+ TMT) and recalculates total', async () => {
    db.order.findFirst.mockResolvedValue({
      id: 77,
      shopId: 10,
      status: OrderStatus.PENDING,
      fulfillmentType: FulfillmentType.DELIVERY,
      itemsTotal: new Prisma.Decimal('70.00'),
      deliveryFee: new Prisma.Decimal('20.00'),
      total: new Prisma.Decimal('90.00'),
      items: [],
    });
    db.order.update.mockImplementation(
      ({
        data,
      }: {
        data: { deliveryFee: Prisma.Decimal; total: Prisma.Decimal };
      }) =>
        Promise.resolve({
          id: 77,
          shopId: 10,
          status: OrderStatus.PENDING,
          fulfillmentType: FulfillmentType.DELIVERY,
          itemsTotal: new Prisma.Decimal('70.00'),
          deliveryFee: data.deliveryFee,
          total: data.total,
          items: [],
        }),
    );

    const updated = await service.updateDeliveryFee(77, 35, seller);
    expect(updated.deliveryFee).toBe('35.00');
    expect(updated.total).toBe('105.00');
  });

  it('restores product stockMl and records RETURN movement when order is cancelled', async () => {
    const existingOrder = {
      id: 77,
      shopId: 10,
      status: OrderStatus.PENDING,
      fulfillmentType: FulfillmentType.DELIVERY,
      itemsTotal: new Prisma.Decimal('70.00'),
      deliveryFee: new Prisma.Decimal('20.00'),
      total: new Prisma.Decimal('90.00'),
      items: [
        {
          id: 1,
          orderId: 77,
          productId: 100,
          variantId: 11,
          productName: 'Perfume 100',
          brand: 'Dior',
          imageUrl: null,
          sku: 'SKU-11',
          ml: 10,
          quantity: 2,
          unitPrice: new Prisma.Decimal('15.00'),
          lineTotal: new Prisma.Decimal('30.00'),
        },
        {
          id: 2,
          orderId: 77,
          productId: 100,
          variantId: 12,
          productName: 'Perfume 100',
          brand: 'Dior',
          imageUrl: null,
          sku: 'SKU-12',
          ml: 30,
          quantity: 1,
          unitPrice: new Prisma.Decimal('40.00'),
          lineTotal: new Prisma.Decimal('40.00'),
        },
      ],
    };
    db.order.findFirst.mockResolvedValue(existingOrder);
    db.order.update.mockResolvedValue({
      ...existingOrder,
      status: OrderStatus.CANCELLED,
    });

    const cancelled = await service.updateStatus(
      77,
      OrderStatus.CANCELLED,
      seller,
    );
    expect(cancelled.status).toBe('CANCELLED');
    expect(db.product.updateMany).toHaveBeenCalledWith({
      where: { id: 100, stockMl: { lte: 2147483647 - 50 } },
      data: { stockMl: { increment: 50 } },
    });
    expect(db.stockMovement.create).toHaveBeenCalledWith({
      data: {
        productId: 100,
        type: 'RETURN',
        deltaMl: 50,
        balanceMl: 120,
        actorId: seller.id,
        note: 'Order #77 cancelled',
      },
    });
  });

  it('rejects changing status of a completed or already cancelled order', async () => {
    db.order.findFirst.mockResolvedValue({
      id: 77,
      status: OrderStatus.CANCELLED,
      items: [],
    });
    await expect(
      service.updateStatus(77, OrderStatus.CONFIRMED, seller),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(db.product.updateMany).not.toHaveBeenCalled();
  });

  it('requires address for DELIVERY and enforces delivery fee >= 20 TMT via ValidationPipe', async () => {
    const pipe = new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    });
    await expect(
      pipe.transform(
        {
          fullName: 'Kemal',
          phone: '+99365123456',
          fulfillmentType: 'DELIVERY',
        },
        { type: 'body', metatype: CreateOrderDto },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);

    await expect(
      pipe.transform(
        {
          fullName: 'Kemal',
          phone: '+99365123456',
          fulfillmentType: 'PICKUP',
        },
        { type: 'body', metatype: CreateOrderDto },
      ),
    ).resolves.toMatchObject({
      fullName: 'Kemal',
      fulfillmentType: 'PICKUP',
    });

    await expect(
      pipe.transform(
        { deliveryFee: 19.99 },
        { type: 'body', metatype: UpdateDeliveryFeeDto },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);

    await expect(
      pipe.transform(
        { deliveryFee: 20 },
        { type: 'body', metatype: UpdateDeliveryFeeDto },
      ),
    ).resolves.toEqual({ deliveryFee: 20 });
  });

  it('throws NotFoundException when a user requests an inaccessible order', async () => {
    db.order.findFirst.mockResolvedValue(null);
    await expect(service.findOne(77, customer)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
