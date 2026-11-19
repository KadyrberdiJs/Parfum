import { ConflictException } from '@nestjs/common';
import { Prisma } from '../../../generated/prisma/client';
import { LoadedCart } from '../cart/cart.types';
import { LoadedOrder } from './order.types';

type MillilitreItem = {
  quantity: number;
  ml?: number;
  productId?: number;
  variant?: { ml: number; productId: number };
};

type StockChange = {
  productId: number;
  deltaMl: number;
  type: 'SALE' | 'RETURN';
  actorId: number | null;
  note: string;
};

// Groups total millilitres requested or returned per product.
export function groupMillilitresByProduct(items: MillilitreItem[]) {
  const totals = new Map<number, number>();
  for (const item of items) {
    const productId = item.productId ?? item.variant!.productId;
    const ml = item.ml ?? item.variant!.ml;
    totals.set(productId, (totals.get(productId) ?? 0) + ml * item.quantity);
  }
  return totals;
}

// Atomically updates a product's millilitre pool and records an audit movement.
export async function changeProductStock(
  transaction: Prisma.TransactionClient,
  change: StockChange,
) {
  const stockLimit =
    change.deltaMl < 0
      ? { gte: -change.deltaMl }
      : { lte: 2147483647 - change.deltaMl };

  const updatedRows = await transaction.product.updateMany({
    where: { id: change.productId, stockMl: stockLimit },
    data: { stockMl: { increment: change.deltaMl } },
  });

  if (updatedRows.count !== 1) {
    throw new ConflictException('Insufficient stock or stock limit exceeded');
  }

  const updated = await transaction.product.findUniqueOrThrow({
    where: { id: change.productId },
    select: { stockMl: true },
  });

  await transaction.stockMovement.create({
    data: {
      productId: change.productId,
      type: change.type,
      deltaMl: change.deltaMl,
      balanceMl: updated.stockMl,
      actorId: change.actorId,
      note: change.note,
    },
  });
}

// Deducts perfume stock for all products in the cart upon checkout.
export async function deductCartStock(
  transaction: Prisma.TransactionClient,
  cart: LoadedCart,
  userId?: number,
) {
  const requiredByProduct = groupMillilitresByProduct(cart.items);
  for (const [productId, requiredMl] of requiredByProduct) {
    await changeProductStock(transaction, {
      productId,
      deltaMl: -requiredMl,
      type: 'SALE',
      actorId: userId ?? null,
      note: 'Customer order',
    });
  }
}

// Restores perfume stock for all products when an order is cancelled.
export async function returnOrderStock(
  transaction: Prisma.TransactionClient,
  order: LoadedOrder,
  actorId: number,
) {
  const returnedByProduct = groupMillilitresByProduct(order.items);
  for (const [productId, returnedMl] of returnedByProduct) {
    await changeProductStock(transaction, {
      productId,
      deltaMl: returnedMl,
      type: 'RETURN',
      actorId,
      note: `Order #${order.id} cancelled`,
    });
  }
}
