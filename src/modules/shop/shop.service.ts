import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateShopDto } from './dto/create-shop.dto';
import { ownedShopWhere } from '../../common/auth/ownership';
import { AuthUser } from '../../common/decorators/current-user.decorator';
import { PaginationDto } from '../../common/pagination.dto';
import { Status } from '../../../generated/prisma/enums';
import { Prisma } from '../../../generated/prisma/client';
import { UpdateShopDto } from './dto/update-shop.dto';
import { ImageService } from '../image/image.service';

@Injectable()
export class ShopService {
  constructor(
    private prisma: PrismaService,
    private imageService: ImageService,
  ) {}

  async create(dto: CreateShopDto, user: AuthUser) {
    return await this.prisma.shop.create({
      data: { ...dto, ownerId: user.id },
    });
  }

  async findAll(query: PaginationDto = new PaginationDto()) {
    return await this.prisma.shop.findMany({
      where: { status: 'APPROVED' },
      skip: query.skip,
      take: query.limit,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });
  }

  findManaged(user: AuthUser, query: PaginationDto) {
    return this.prisma.shop.findMany({
      where: ownedShopWhere(user),
      skip: query.skip,
      take: query.limit,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });
  }

  async findOne(id: number) {
    const shop = await this.prisma.shop.findUnique({
      where: { id, status: 'APPROVED' },
    });

    if (!shop) {
      throw new NotFoundException(`Shop with id:${id} not found!`);
    }
    return shop;
  }

  async update(id: number, dto: UpdateShopDto, user: AuthUser) {
    const data: Prisma.ShopUpdateInput = { ...dto };

    try {
      return await this.prisma.shop.update({
        where: { id, AND: [ownedShopWhere(user)] },
        data: data,
      });
    } catch (e) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === 'P2025'
      ) {
        throw new NotFoundException(`Shop with id:${id} not found!`);
      }
      throw e;
    }
  }

  setStatus(id: number, status: Status) {
    return this.prisma.shop.update({ where: { id }, data: { status } });
  }

  async remove(id: number, user: AuthUser) {
    const shop = await this.prisma.shop.findFirst({
      where: { id, AND: [ownedShopWhere(user)] },
      select: {
        products: {
          where: { stockMovements: { some: {} } },
          select: { id: true },
          take: 1,
        },
      },
    });
    if (!shop) {
      throw new NotFoundException(`Shop with id:${id} not found!`);
    }
    if (shop.products.length > 0) {
      return this.suspend(id, user);
    }
    try {
      const deleted = await this.prisma.shop.delete({
        where: { id, AND: [ownedShopWhere(user)] },
      });
      await this.imageService.deleteQueuedFiles();
      return deleted;
    } catch (e) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === 'P2025'
      ) {
        throw new NotFoundException(`Shop with id:${id} not found!`);
      }
      throw e;
    }
  }

  private suspend(id: number, user: AuthUser) {
    return this.prisma.shop.update({
      where: { id, AND: [ownedShopWhere(user)] },
      data: { status: Status.SUSPENDED },
    });
  }
}
