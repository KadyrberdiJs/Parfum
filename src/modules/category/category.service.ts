import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { PaginationDto } from '../../common/pagination.dto';
import { Prisma } from '../../../generated/prisma/client';

@Injectable()
export class CategoryService {
  constructor(private prisma: PrismaService) {}

  async create(dto: CreateCategoryDto) {
    try {
      return await this.prisma.category.create({
        data: { ...dto },
      });
    } catch (e) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === 'P2003'
      ) {
        throw new BadRequestException(
          `Parent category with id:${dto.parentId} not found!`,
        );
      }
      throw e;
    }
  }

  async findAll(query: PaginationDto = new PaginationDto()) {
    return await this.prisma.category.findMany({
      where: { parentId: null },
      include: { children: true },
      skip: query.skip,
      take: query.limit,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });
  }

  async findOne(id: number) {
    const category = await this.prisma.category.findUnique({
      where: { id: id },
      include: { children: true, parent: true },
    });

    if (!category) {
      throw new NotFoundException(`Category with id:${id} not found!`);
    }
    return category;
  }

  async update(id: number, dto: UpdateCategoryDto) {
    if (dto.parentId === id) {
      throw new BadRequestException('Category cannot be its own parent!');
    }

    const data: Prisma.CategoryUncheckedUpdateInput = { ...dto };

    try {
      return await this.prisma.$transaction(
        async (tx) => {
          const seen = new Set<number>([id]);
          let parentId: number | null | undefined = dto.parentId;
          while (parentId != null) {
            if (seen.has(parentId))
              throw new BadRequestException(
                'Category hierarchy cannot contain a cycle',
              );
            seen.add(parentId);
            const parent: { parentId: number | null } | null =
              await tx.category.findUnique({
                where: { id: parentId },
                select: { parentId: true },
              });
            if (!parent)
              throw new BadRequestException('Parent category not found');
            parentId = parent.parentId;
          }
          return tx.category.update({
            where: { id: id },
            data: data,
          });
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (e) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === 'P2025'
      ) {
        throw new NotFoundException(`Category with id:${id} not found!`);
      }
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === 'P2003'
      ) {
        throw new BadRequestException(
          `Parent category with id:${dto.parentId} not found!`,
        );
      }
      throw e;
    }
  }

  async remove(id: number) {
    try {
      return await this.prisma.category.delete({
        where: { id: id },
      });
    } catch (e) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === 'P2025'
      ) {
        throw new NotFoundException(`Category with id:${id} not found!`);
      }
      throw e;
    }
  }
}
