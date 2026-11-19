import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createHash } from 'crypto';
import {
  FulfillmentType,
  OrderStatus,
  Prisma,
} from '../../../generated/prisma/client';
import { ownedOrderWhere } from '../../common/auth/ownership';
import { AuthUser } from '../../common/decorators/current-user.decorator';
import { PaginationDto } from '../../common/pagination.dto';
import {
  cartInclude,
  CartOwner,
  isValidGuestToken,
  LoadedCart,
} from '../cart/cart.types';
import { stockConflicts } from '../cart/cart-stock';
import { PrismaService } from '../prisma/prisma.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { createShopOrders, presentOrder } from './order-snapshot';
import { deductCartStock, returnOrderStock } from './order-stock';
import { LoadedOrder, orderInclude } from './order.types';

@Injectable()
export class OrderService {
  constructor(private readonly prisma: PrismaService) {}

  // Places orders from the active cart, deducts stock, and clears the cart.
  placeOrder(owner: CartOwner, dto: CreateOrderDto) {
    return this.transaction(async (transaction) => {
      const cart = await this.requireNonEmptyCart(transaction, owner);
      this.ensureCartAvailable(cart);
      await deductCartStock(transaction, cart, owner.userId);
      const orders = await createShopOrders(
        transaction,
        cart,
        owner.userId,
        dto,
      );
      await transaction.cartItem.deleteMany({ where: { cartId: cart.id } });
      return orders.map((order) => presentOrder(order));
    });
  }

  // Returns all orders belonging to the authenticated customer.
  async findMyOrders(
    user: AuthUser,
    query: PaginationDto = new PaginationDto(),
  ) {
    const orders = await this.prisma.order.findMany({
      where: { userId: user.id },
      include: orderInclude,
      skip: query.skip,
      take: query.limit,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });
    return orders.map((order) => presentOrder(order));
  }

  // Returns orders belonging to the seller's shops for store management.
  async findManaged(
    user: AuthUser,
    query: PaginationDto = new PaginationDto(),
  ) {
    const orders = await this.prisma.order.findMany({
      where: ownedOrderWhere(user),
      include: orderInclude,
      skip: query.skip,
      take: query.limit,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });
    return orders.map((order) => presentOrder(order));
  }

  // Returns a single order if the user owns it or manages its shop.
  async findOne(id: number, user: AuthUser) {
    const order = await this.prisma.order.findFirst({
      where: { id, AND: [this.accessibleOrderWhere(user)] },
      include: orderInclude,
    });
    if (!order) throw new NotFoundException(`Order with id:${id} not found!`);
    return presentOrder(order);
  }

  // Updates order status and restores perfume stock when cancelled.
  updateStatus(id: number, status: OrderStatus, user: AuthUser) {
    return this.transaction(async (transaction) => {
      const order = await this.findManagedOrder(transaction, id, user);
      this.ensureValidTransition(order.status, status);
      if (
        status === OrderStatus.CANCELLED &&
        order.status !== OrderStatus.CANCELLED
      ) {
        await returnOrderStock(transaction, order, user.id);
      }
      const updated = await transaction.order.update({
        where: { id: order.id },
        data: { status },
        include: orderInclude,
      });
      return presentOrder(updated);
    });
  }

  // Updates delivery fee for an active delivery order and recalculates total.
  updateDeliveryFee(id: number, deliveryFee: number, user: AuthUser) {
    return this.transaction(async (transaction) => {
      const order = await this.findManagedOrder(transaction, id, user);
      if (order.fulfillmentType !== FulfillmentType.DELIVERY) {
        throw new BadRequestException(
          'Delivery fee can only be changed on delivery orders',
        );
      }
      if (
        order.status === OrderStatus.COMPLETED ||
        order.status === OrderStatus.CANCELLED
      ) {
        throw new BadRequestException(
          'Cannot change delivery fee on a finished order',
        );
      }
      const nextFee = new Prisma.Decimal(deliveryFee);
      const updated = await transaction.order.update({
        where: { id: order.id },
        data: {
          deliveryFee: nextFee,
          total: order.itemsTotal.plus(nextFee),
        },
        include: orderInclude,
      });
      return presentOrder(updated);
    });
  }

  // Loads the user or guest cart, throwing 400 if missing or empty.
  private async requireNonEmptyCart(
    transaction: Prisma.TransactionClient,
    owner: CartOwner,
  ) {
    const cart = await this.findCart(transaction, owner);
    if (!cart || cart.items.length === 0) {
      throw new BadRequestException('Cart is empty');
    }
    return cart;
  }

  // Finds a customer or guest cart from the database by identity.
  private findCart(
    transaction: Prisma.TransactionClient,
    owner: CartOwner,
  ): Promise<LoadedCart | null> {
    if (owner.userId) {
      return transaction.cart.findUnique({
        where: { userId: owner.userId },
        include: cartInclude,
      });
    }
    if (!owner.guestToken || !isValidGuestToken(owner.guestToken)) {
      return Promise.resolve(null);
    }
    return transaction.cart.findUnique({
      where: {
        guestTokenHash: this.hashToken(owner.guestToken),
        AND: { userId: null },
        expiresAt: { gt: new Date() },
      },
      include: cartInclude,
    });
  }

  // Validates that all cart items are active and have sufficient millilitres in stock.
  private ensureCartAvailable(cart: LoadedCart) {
    const selection = cart.items.map(({ variantId, quantity }) => ({
      variantId,
      quantity,
    }));
    const variants = cart.items.map((item) => item.variant);
    const conflicts = stockConflicts(selection, variants, selection);
    if (conflicts.length > 0) {
      throw new ConflictException({
        code: 'CART_AVAILABILITY_CONFLICT',
        message: 'Not enough perfume available or product no longer for sale',
        ...conflicts[0],
        conflicts,
      });
    }
  }

  // Loads an order for management, throwing 404 if the seller does not own its shop.
  private async findManagedOrder(
    transaction: Prisma.TransactionClient,
    id: number,
    user: AuthUser,
  ): Promise<LoadedOrder> {
    const order = await transaction.order.findFirst({
      where: { id, AND: [ownedOrderWhere(user)] },
      include: orderInclude,
    });
    if (!order) throw new NotFoundException(`Order with id:${id} not found!`);
    return order;
  }

  // Builds Prisma access filter ensuring users can only read their own or managed orders.
  private accessibleOrderWhere(user: AuthUser): Prisma.OrderWhereInput {
    if (user.role === 'SUPER_ADMIN') return {};
    if (user.role === 'ADMIN') {
      return { OR: [{ userId: user.id }, { shop: { ownerId: user.id } }] };
    }
    return { userId: user.id };
  }

  // Validates status transition rules (finished orders cannot transition backwards).
  private ensureValidTransition(current: OrderStatus, next: OrderStatus) {
    if (current === next) return;
    if (
      current === OrderStatus.COMPLETED ||
      current === OrderStatus.CANCELLED
    ) {
      throw new BadRequestException(
        `Cannot change status of a ${current.toLowerCase()} order`,
      );
    }
    if (current === OrderStatus.CONFIRMED && next === OrderStatus.PENDING) {
      throw new BadRequestException(
        'Cannot move a confirmed order back to pending',
      );
    }
  }

  // SHA-256 hash helper for guest tokens.
  private hashToken(token: string) {
    return createHash('sha256').update(token).digest('hex');
  }

  // Executes an operation within a Serializable transaction with retry on conflict.
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
          error.code !== 'P2034'
        )
          throw error;
        if (attempt === 2)
          throw new ConflictException(
            'Order changed concurrently; reload and try again',
          );
      }
    }
    throw new ConflictException('Could not process order');
  }
}
