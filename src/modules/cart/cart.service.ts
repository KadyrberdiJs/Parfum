import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { createHash, randomBytes } from 'crypto';
import { Prisma } from '../../../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AddCartItemDto } from './dto/cart-item.dto';
import {
  cartInclude,
  CartIdentity,
  GUEST_CART_LIFETIME_MS,
  LoadedCart,
  Selection,
  variantInclude,
} from './cart.types';
import {
  checkCartLimits,
  combineSelections,
  presentCart,
  stockConflicts,
} from './cart-stock';

@Injectable()
export class CartService {
  constructor(private readonly prisma: PrismaService) {}

  read(identity: CartIdentity) {
    return this.transaction(async (transaction) =>
      presentCart(await this.findCart(transaction, identity)),
    );
  }

  add(identity: CartIdentity, dto: AddCartItemDto) {
    return this.transaction(async (transaction) => {
      let cart = await this.findCart(transaction, identity);
      const previous = this.selection(cart);
      const desired = combineSelections(previous, [dto]);
      checkCartLimits(desired);
      await this.checkStock(transaction, desired, previous, dto.variantId);
      let guestToken = identity.userId ? undefined : identity.guestToken;
      if (!cart) {
        guestToken = identity.userId
          ? undefined
          : randomBytes(32).toString('hex');
        cart = await transaction.cart.create({
          data: identity.userId
            ? { userId: identity.userId }
            : {
                guestTokenHash: this.hashToken(guestToken!),
                expiresAt: this.guestExpiry(),
              },
          include: cartInclude,
        });
      }
      const quantity = desired.find(
        (item) => item.variantId === dto.variantId,
      )!.quantity;
      await transaction.cartItem.upsert({
        where: {
          cartId_variantId: { cartId: cart.id, variantId: dto.variantId },
        },
        create: { cartId: cart.id, variantId: dto.variantId, quantity },
        update: { quantity },
      });
      const updated = await this.touchCart(transaction, cart);
      return { cart: presentCart(updated), guestToken };
    });
  }

  setQuantity(identity: CartIdentity, itemId: number, quantity: number) {
    return this.transaction(async (transaction) => {
      const cart = await this.requireCart(transaction, identity);
      const item = cart.items.find((line) => line.id === itemId);
      if (!item) throw new NotFoundException('Cart item not found');
      const previous = this.selection(cart);
      const desired = previous.map((line) =>
        line.variantId === item.variantId ? { ...line, quantity } : line,
      );
      checkCartLimits(desired);
      if (quantity > item.quantity)
        await this.checkStock(transaction, desired, previous, item.variantId);
      await transaction.cartItem.update({
        where: { id: itemId, cartId: cart.id },
        data: { quantity },
      });
      const updated = await this.touchCart(transaction, cart);
      return {
        cart: presentCart(updated),
        guestToken: identity.userId ? undefined : identity.guestToken,
      };
    });
  }

  remove(identity: CartIdentity, itemId: number) {
    return this.transaction(async (transaction) => {
      const cart = await this.requireCart(transaction, identity);
      const deleted = await transaction.cartItem.deleteMany({
        where: { id: itemId, cartId: cart.id },
      });
      if (deleted.count === 0)
        throw new NotFoundException('Cart item not found');
      const updated = await this.touchCart(transaction, cart);
      return {
        cart: presentCart(updated),
        guestToken: identity.userId ? undefined : identity.guestToken,
      };
    });
  }

  clear(identity: CartIdentity) {
    return this.transaction(async (transaction) => {
      const cart = await this.findCart(transaction, identity);
      if (!cart) return { cart: presentCart(null), guestToken: undefined };
      await transaction.cartItem.deleteMany({ where: { cartId: cart.id } });
      const updated = await this.touchCart(transaction, cart);
      return {
        cart: presentCart(updated),
        guestToken: identity.userId ? undefined : identity.guestToken,
      };
    });
  }

  merge(userId: number, guestToken?: string) {
    if (!userId) throw new UnauthorizedException();
    return this.transaction(async (transaction) => {
      const guest = await this.findCart(transaction, { guestToken });
      const account = await this.findCart(transaction, { userId });
      if (!guest) return presentCart(account);
      const desired = combineSelections(
        this.selection(account),
        this.selection(guest),
      );
      checkCartLimits(desired);
      await this.checkStock(transaction, desired, this.selection(account));
      if (!account) {
        const claimed = await transaction.cart.update({
          where: { id: guest.id, AND: { userId: null } },
          data: { userId, guestTokenHash: null, expiresAt: null },
          include: cartInclude,
        });
        return presentCart(claimed);
      }
      // Replacing the bounded selection also consumes the guest cart in the same transaction.
      await transaction.cartItem.deleteMany({ where: { cartId: account.id } });
      if (desired.length)
        await transaction.cartItem.createMany({
          data: desired.map((item) => ({ ...item, cartId: account.id })),
        });
      await transaction.cart.delete({
        where: { id: guest.id, AND: { userId: null } },
      });
      return presentCart(await this.touchCart(transaction, account));
    });
  }

  private async checkStock(
    transaction: Prisma.TransactionClient,
    desired: Selection[],
    previous: Selection[],
    changedVariantId?: number,
  ) {
    const variants = await transaction.productVariant.findMany({
      where: { id: { in: desired.map((item) => item.variantId) } },
      include: variantInclude,
    });
    if (variants.length !== desired.length)
      throw new ConflictException({
        code: 'VARIANT_UNAVAILABLE',
        message: 'A selected size no longer exists; refresh the cart',
      });
    const productId =
      changedVariantId === undefined
        ? undefined
        : variants.find((variant) => variant.id === changedVariantId)!
            .productId;
    const conflicts = stockConflicts(desired, variants, previous).filter(
      (conflict) => productId === undefined || conflict.productId === productId,
    );
    if (conflicts.length)
      throw new ConflictException({
        code: 'CART_AVAILABILITY_CONFLICT',
        message: 'Not enough perfume available or product no longer for sale',
        ...conflicts[0],
        conflicts,
      });
  }

  private findCart(
    transaction: Prisma.TransactionClient,
    identity: CartIdentity,
  ): Promise<LoadedCart | null> {
    if (identity.userId)
      return transaction.cart.findUnique({
        where: { userId: identity.userId },
        include: cartInclude,
      });
    if (!identity.guestToken || !/^[a-f0-9]{64}$/.test(identity.guestToken))
      return Promise.resolve(null);
    return transaction.cart.findUnique({
      where: {
        guestTokenHash: this.hashToken(identity.guestToken),
        AND: { userId: null },
        expiresAt: { gt: new Date() },
      },
      include: cartInclude,
    });
  }

  private async requireCart(
    transaction: Prisma.TransactionClient,
    identity: CartIdentity,
  ) {
    const cart = await this.findCart(transaction, identity);
    if (!cart) throw new NotFoundException('Cart not found or expired');
    return cart;
  }

  private touchCart(transaction: Prisma.TransactionClient, cart: LoadedCart) {
    return transaction.cart.update({
      where: { id: cart.id },
      data: {
        updatedAt: new Date(),
        expiresAt: cart.userId ? null : this.guestExpiry(),
      },
      include: cartInclude,
    });
  }

  private selection(cart: LoadedCart | null): Selection[] {
    return (
      cart?.items.map(({ variantId, quantity }) => ({ variantId, quantity })) ??
      []
    );
  }

  private hashToken(token: string) {
    return createHash('sha256').update(token).digest('hex');
  }
  private guestExpiry() {
    return new Date(Date.now() + GUEST_CART_LIFETIME_MS);
  }

  private async transaction<T>(
    operation: (transaction: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        return await this.prisma.$transaction(operation, {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        });
      } catch (error) {
        if (
          !(error instanceof Prisma.PrismaClientKnownRequestError) ||
          !['P2034', 'P2002'].includes(error.code)
        )
          throw error;
        if (attempt === 2)
          throw new ConflictException(
            'Cart changed concurrently; reload and try again',
          );
      }
    }
    throw new ConflictException('Could not update cart');
  }
}
