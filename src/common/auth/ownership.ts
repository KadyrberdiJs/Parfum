import { Prisma, UserRole } from '../../../generated/prisma/client';
import { AuthUser } from '../decorators/current-user.decorator';

export function ownedProductWhere(user: AuthUser): Prisma.ProductWhereInput {
  if (user.role === UserRole.SUPER_ADMIN) {
    return {};
  }
  return { shop: { ownerId: user.id } };
}

export function ownedShopWhere(user: AuthUser): Prisma.ShopWhereInput {
  if (user.role === UserRole.SUPER_ADMIN) return {};
  return { ownerId: user.id };
}
