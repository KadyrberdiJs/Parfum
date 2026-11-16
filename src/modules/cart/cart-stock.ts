import { ConflictException } from '@nestjs/common';
import { Prisma } from '../../../generated/prisma/client';
import {
  LoadedCart,
  LoadedVariant,
  MAX_CART_ITEMS,
  Selection,
} from './cart.types';

export function combineSelections(...selections: Selection[][]): Selection[] {
  const quantities = new Map<number, number>();
  for (const items of selections) {
    for (const item of items)
      quantities.set(
        item.variantId,
        (quantities.get(item.variantId) ?? 0) + item.quantity,
      );
  }
  return [...quantities].map(([variantId, quantity]) => ({
    variantId,
    quantity,
  }));
}

export function checkCartLimits(items: Selection[]) {
  if (items.length > MAX_CART_ITEMS)
    throw new ConflictException(
      `A cart can contain at most ${MAX_CART_ITEMS} variants`,
    );
  if (
    items.some(
      (item) =>
        !Number.isInteger(item.quantity) ||
        item.quantity < 1 ||
        item.quantity > 99,
    )
  )
    throw new ConflictException(
      'Each variant must have between 1 and 99 bottles',
    );
}

export function stockConflicts(
  items: Selection[],
  variants: LoadedVariant[],
  previous: Selection[] = [],
) {
  const sizes = new Map(variants.map((variant) => [variant.id, variant]));
  const requestedByProduct = new Map<
    number,
    { product: LoadedVariant['product']; requestedMl: number }
  >();
  const previousByProduct = new Map<number, number>();
  for (const item of previous) {
    const variant = sizes.get(item.variantId);
    if (variant)
      previousByProduct.set(
        variant.productId,
        (previousByProduct.get(variant.productId) ?? 0) +
          variant.ml * item.quantity,
      );
  }
  for (const item of items) {
    const variant = sizes.get(item.variantId);
    if (!variant) continue;
    const entry = requestedByProduct.get(variant.productId) ?? {
      product: variant.product,
      requestedMl: 0,
    };
    entry.requestedMl += variant.ml * item.quantity;
    requestedByProduct.set(variant.productId, entry);
  }
  return [...requestedByProduct.values()]
    .filter(
      ({ product, requestedMl }) =>
        requestedMl > product.stockMl ||
        !product.isActive ||
        product.shop.status !== 'APPROVED',
    )
    .map(({ product, requestedMl }) => ({
      productId: product.id,
      productName: product.name,
      reason:
        !product.isActive || product.shop.status !== 'APPROVED'
          ? 'PRODUCT_UNAVAILABLE'
          : 'INSUFFICIENT_STOCK',
      availableMl: product.stockMl,
      inCartMl: previousByProduct.get(product.id) ?? 0,
      requestedMl,
      remainingToAddMl: Math.max(
        0,
        product.stockMl - (previousByProduct.get(product.id) ?? 0),
      ),
    }));
}

export function presentCart(cart: LoadedCart | null) {
  const items = cart?.items ?? [];
  const variants = items.map((item) => item.variant);
  const selection = items.map(({ variantId, quantity }) => ({
    variantId,
    quantity,
  }));
  const conflicts = stockConflicts(selection, variants, selection);
  const conflictsByProduct = new Set(
    conflicts.map((conflict) => conflict.productId),
  );
  const millilitresByProduct = new Map<number, number>();
  for (const item of items) {
    const productId = item.variant.productId;
    millilitresByProduct.set(
      productId,
      (millilitresByProduct.get(productId) ?? 0) +
        item.variant.ml * item.quantity,
    );
  }
  let total = new Prisma.Decimal(0);
  const lines = items.map((item) => {
    const { variant } = item;
    const lineTotal = variant.price.mul(item.quantity);
    total = total.plus(lineTotal);
    const inCartMl = millilitresByProduct.get(variant.productId) ?? 0;
    return {
      id: item.id,
      variantId: variant.id,
      productId: variant.productId,
      productName: variant.product.name,
      shopId: variant.product.shopId,
      imageUrl: variant.product.imageUrl,
      ml: variant.ml,
      quantity: item.quantity,
      unitPrice: variant.price.toFixed(2),
      lineTotal: lineTotal.toFixed(2),
      availableMl: variant.product.stockMl,
      inCartMl,
      remainingToAddMl: Math.max(0, variant.product.stockMl - inCartMl),
      available: !conflictsByProduct.has(variant.productId),
    };
  });
  return {
    id: cart?.id ?? null,
    items: lines,
    total: total.toFixed(2),
    conflicts,
    hasAvailabilityIssues: conflicts.length > 0,
    expiresAt: cart?.expiresAt ?? null,
  };
}
