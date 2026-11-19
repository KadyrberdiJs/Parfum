import { Prisma } from '../../../generated/prisma/client';
import { LoadedCart } from '../cart/cart.types';

export const orderInclude = {
  items: { orderBy: { id: 'asc' } },
} satisfies Prisma.OrderInclude;

export type LoadedOrder = Prisma.OrderGetPayload<{
  include: typeof orderInclude;
}>;
export type LoadedCartItem = LoadedCart['items'][number];
