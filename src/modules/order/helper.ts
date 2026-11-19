import { LoadedCartItem, LoadedOrder } from './order.types';

// Groups cart items by shop to support multi-vendor order splitting.
export function groupItemsByShop(items: LoadedCartItem[]) {
  const byShop = new Map<number, LoadedCartItem[]>();
  for (const item of items) {
    const shopId = item.variant.product.shopId;
    const list = byShop.get(shopId) ?? [];
    list.push(item);
    byShop.set(shopId, list);
  }
  return byShop;
}

// Formats decimal currency fields to 2-decimal strings for API responses.
export function presentOrder(order: LoadedOrder) {
  return {
    ...order,
    itemsTotal: order.itemsTotal.toFixed(2),
    deliveryFee: order.deliveryFee.toFixed(2),
    total: order.total.toFixed(2),
    items: order.items.map((item) => ({
      ...item,
      unitPrice: item.unitPrice.toFixed(2),
      lineTotal: item.lineTotal.toFixed(2),
    })),
  };
}
