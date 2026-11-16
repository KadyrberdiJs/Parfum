import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '../../../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ownedProductWhere } from '../../common/auth/ownership';
import { AuthUser } from '../../common/decorators/current-user.decorator';
import { PaginationDto } from '../../common/pagination.dto';
import { StockMovementDto } from './dto/stock-movement.dto';
import { StockSaleDto } from './dto/stock-sale.dto';
@Injectable()
export class ProductStockService {
  constructor(private readonly prisma: PrismaService) {}

  async history(productId: number, user: AuthUser, query: PaginationDto) {
    const product = await this.prisma.product.findFirst({
      where: { id: productId, ...ownedProductWhere(user) },
      select: { id: true },
    });
    if (!product) throw new NotFoundException('Product not found');
    return this.prisma.stockMovement.findMany({
      where: { productId },
      orderBy: { id: 'desc' },
      skip: query.skip,
      take: query.limit,
    });
  }

  adjust(productId: number, dto: StockMovementDto, user: AuthUser) {
    this.validateDirection(dto);
    return this.prisma.$transaction(
      (tx) => this.recordMovement(tx, productId, dto, user),
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  sell(productId: number, dto: StockSaleDto, user: AuthUser) {
    return this.prisma.$transaction(
      async (tx) => {
        const ids = [...new Set(dto.items.map((item) => item.variantId))];
        const variants = await tx.productVariant.findMany({
          where: { productId, id: { in: ids } },
          select: { id: true, ml: true },
        });
        if (variants.length !== ids.length)
          throw new BadRequestException(
            'Every variant must belong to this product',
          );
        const sizes = new Map(
          variants.map((variant) => [variant.id, variant.ml]),
        );
        const requiredMl = dto.items.reduce(
          (total, item) => total + sizes.get(item.variantId)! * item.quantity,
          0,
        );
        if (
          !Number.isSafeInteger(requiredMl) ||
          requiredMl <= 0 ||
          requiredMl > 2147483647
        )
          throw new BadRequestException('Invalid total millilitres');
        return this.recordMovement(
          tx,
          productId,
          { type: 'SALE', deltaMl: -requiredMl, note: dto.note },
          user,
        );
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  private validateDirection(dto: StockMovementDto) {
    if (
      !Number.isInteger(dto.deltaMl) ||
      dto.deltaMl === 0 ||
      Math.abs(dto.deltaMl) > 2147483647
    )
      throw new BadRequestException('Invalid millilitres');
    if ((dto.type === 'REFILL' || dto.type === 'RETURN') && dto.deltaMl < 0)
      throw new BadRequestException('Refill and return must add millilitres');
    if ((dto.type === 'SALE' || dto.type === 'SPILLAGE') && dto.deltaMl > 0)
      throw new BadRequestException(
        'Sale and spillage must remove millilitres',
      );
  }

  private async recordMovement(
    tx: Prisma.TransactionClient,
    productId: number,
    dto: StockMovementDto,
    user: AuthUser,
  ) {
    const where = { id: productId, ...ownedProductWhere(user) };
    const product = await tx.product.findFirst({ where, select: { id: true } });
    if (!product) throw new NotFoundException('Product not found');
    const stockLimit =
      dto.deltaMl < 0
        ? { gte: -dto.deltaMl }
        : { lte: 2147483647 - dto.deltaMl };
    const changed = await tx.product.updateMany({
      where: { ...where, stockMl: stockLimit },
      data: { stockMl: { increment: dto.deltaMl } },
    });
    if (changed.count !== 1)
      throw new ConflictException('Insufficient stock or stock limit exceeded');
    const updated = await tx.product.findUniqueOrThrow({
      where: { id: productId },
      select: { stockMl: true },
    });
    return tx.stockMovement.create({
      data: { productId, ...dto, balanceMl: updated.stockMl, actorId: user.id },
    });
  }
}
