import {
  BadRequestException,
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto, VariantChangesDto } from './dto/update-product.dto';
import { PaginationDto } from '../../common/pagination.dto';
import { Prisma } from '../../../generated/prisma/client';
import { ownedProductWhere, ownedShopWhere } from '../../common/auth/ownership';
import { AuthUser } from '../../common/decorators/current-user.decorator';

@Injectable()
export class ProductService {
  constructor(private prisma: PrismaService) {}

  async create(dto: CreateProductDto, user: AuthUser) {
    const { variants, ...productData } = dto;

    const shop = await this.prisma.shop.findFirst({
      where: { id: dto.shopId, ...ownedShopWhere(user) },
    });
    if (!shop) throw new ForbiddenException('You do not own this shop');

    try {
      return await this.prisma.product.create({
        data: {
          ...productData,
          variants: {
            create: variants,
          },
        },
        include: { variants: true },
      });
    } catch (e) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === 'P2002'
      ) {
        throw new BadRequestException(
          'Product with this slug, sku or duplicate ml already exists!',
        );
      }
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === 'P2003'
      ) {
        throw new BadRequestException(`Category or shop not found!`);
      }
      throw e;
    }
  }

  async findAll(query: PaginationDto = new PaginationDto()) {
    return await this.prisma.product.findMany({
      where: { isActive: true, shop: { status: 'APPROVED' } },
      skip: query.skip,
      take: query.limit,
      include: { variants: true, category: true },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });
  }

  findManaged(user: AuthUser, query: PaginationDto) {
    return this.prisma.product.findMany({
      where: ownedProductWhere(user),
      skip: query.skip,
      take: query.limit,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });
  }

  async findOne(id: number) {
    const product = await this.prisma.product.findUnique({
      where: { id, isActive: true, shop: { status: 'APPROVED' } },
      include: { variants: true, category: true, shop: true },
    });

    if (!product) {
      throw new NotFoundException(`Product with id:${id} not found!`);
    }
    return product;
  }

  async update(id: number, dto: UpdateProductDto, user: AuthUser) {
    const { variants, ...productData } = dto;

    const data: Prisma.ProductUncheckedUpdateInput = { ...productData };

    if (variants) {
      data.variants = this.buildVariantChanges(variants);
    }

    try {
      return await this.prisma.$transaction(
        async (tx) => {
          const product = await tx.product.update({
            where: { id, AND: [ownedProductWhere(user)] },
            data: data,
            include: { variants: true },
          });
          if (product.variants.length === 0)
            throw new BadRequestException(
              'A product must have at least one variant',
            );
          return product;
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (e) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === 'P2025'
      ) {
        throw new NotFoundException(
          `Product with id:${id} or one of its variants not found!`,
        );
      }
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === 'P2002'
      ) {
        throw new BadRequestException('Duplicate slug, sku or ml value!');
      }
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === 'P2003'
      ) {
        throw new BadRequestException(`Category or shop not found!`);
      }
      throw e;
    }
  }

  async remove(id: number, user: AuthUser) {
    try {
      return await this.prisma.product.delete({
        where: { id, AND: [ownedProductWhere(user)] },
      });
    } catch (e) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === 'P2025'
      ) {
        throw new NotFoundException(`Product with id:${id} not found!`);
      }
      throw e;
    }
  }

  private buildVariantChanges(
    changes: VariantChangesDto,
  ): Prisma.ProductUncheckedUpdateInput['variants'] {
    return {
      create: changes.create,
      update: changes.update?.map(({ id, ...variantData }) => ({
        where: { id },
        data: variantData,
      })),
      delete: changes.delete?.map((variantId) => ({ id: variantId })),
    };
  }
}
