import type { Request } from 'express';
import { Prisma } from '../../../generated/prisma/client';
import type { AuthUser } from '../../common/decorators/current-user.decorator';

export type CartOwner = { userId?: number; guestToken?: string };
export type CartRequest = Request & { user?: AuthUser };
export type Selection = { variantId: number; quantity: number };
export const MAX_CART_ITEMS = 100;
export const GUEST_CART_LIFETIME_MS = 30 * 24 * 60 * 60 * 1000;

const GUEST_TOKEN_FORMAT = /^[a-f0-9]{64}$/;

export function isValidGuestToken(token: string) {
  return GUEST_TOKEN_FORMAT.test(token);
}

export const variantInclude = {
  product: {
    select: {
      id: true,
      name: true,
      images: {
        orderBy: { position: 'asc' },
        take: 1,
        select: { image: { select: { url: true } } },
      },
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
