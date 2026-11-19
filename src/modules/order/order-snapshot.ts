import { FulfillmentType, Prisma } from '../../../generated/prisma/client';
import { LoadedCart } from '../cart/cart.types';
import { CreateOrderDto } from './dto/create-order.dto';
import { MIN_DELIVERY_FEE_TMT } from './dto/update-delivery-fee.dto';
import { LoadedCartItem, LoadedOrder, orderInclude } from './order.types';

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

// Generates an Order record for each shop represented in the cart.
export async function createShopOrders(
  transaction: Prisma.TransactionClient,
  cart: LoadedCart,
  userId: number | undefined,
  dto: CreateOrderDto,
): Promise<LoadedOrder[]> {
  const itemsByShop = groupItemsByShop(cart.items);
  const defaultDeliveryFee =
    dto.fulfillmentType === FulfillmentType.DELIVERY
      ? new Prisma.Decimal(MIN_DELIVERY_FEE_TMT)
      : new Prisma.Decimal(0);
  const address =
    dto.fulfillmentType === FulfillmentType.DELIVERY
      ? dto.address!
      : (dto.address ?? null);

  const createdOrders: LoadedOrder[] = [];
  for (const [shopId, items] of itemsByShop) {
    const shopName = items[0].variant.product.shop.name;
    const snapshotItems = items.map((item) => buildItemSnapshot(item));
    const itemsTotal = snapshotItems.reduce(
      (sum, item) => sum.plus(item.lineTotal),
      new Prisma.Decimal(0),
    );

    const order = await transaction.order.create({
      data: {
        shopId,
        shopName,
        userId: userId ?? null,
        fullName: dto.fullName,
        phone: dto.phone,
        address,
        note: dto.note ?? null,
        fulfillmentType: dto.fulfillmentType,
        itemsTotal,
        deliveryFee: defaultDeliveryFee,
        total: itemsTotal.plus(defaultDeliveryFee),
        items: { create: snapshotItems },
      },
      include: orderInclude,
    });
    createdOrders.push(order);
  }
  return createdOrders;
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
