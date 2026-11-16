import { Prisma } from '../../../generated/prisma/client';
export type CartIdentity = { userId?: number; guestToken?: string };
export type Selection = { variantId: number; quantity: number };
export const MAX_CART_ITEMS = 100;
export const GUEST_CART_LIFETIME_MS = 30 * 24 * 60 * 60 * 1000;
export const variantInclude = {
  product: {
    select: {
      id: true,
      name: true,
      imageUrl: true,
      shopId: true,
      isActive: true,
      stockMl: true,
      shop: { select: { status: true } },
    },
  },
} satisfies Prisma.ProductVariantInclude;
export const cartInclude = {
  items: {
    orderBy: { id: 'asc' },
    include: { variant: { include: variantInclude } },
  },
} satisfies Prisma.CartInclude;
export type LoadedCart = Prisma.CartGetPayload<{ include: typeof cartInclude }>;
export type LoadedVariant = Prisma.ProductVariantGetPayload<{
  include: typeof variantInclude;
}>;
