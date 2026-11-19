import { LoadedCartItem } from './order.types';

// Creates a frozen snapshot of a cart item at checkout time.
export function buildItemSnapshot(item: LoadedCartItem) {
  const { variant } = item;
  const lineTotal = variant.price.mul(item.quantity);
  return {
    productId: variant.productId,
    variantId: variant.id,
    productName: variant.product.name,
    brand: variant.product.brand,
    imageUrl: variant.product.images[0]?.image.url ?? null,
    sku: variant.sku,
    ml: variant.ml,
    quantity: item.quantity,
    unitPrice: variant.price,
    lineTotal,
  };
}
