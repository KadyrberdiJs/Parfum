import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto, VariantChangesDto } from './dto/update-product.dto';
import { Prisma } from 'generated/prisma/client';

@Injectable()
export class ProductService {
    constructor(private prisma: PrismaService) {};

    async create(dto: CreateProductDto) {
        const { variants, ...productData } = dto;

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
            if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
                throw new BadRequestException('Product with this slug, sku or duplicate ml already exists!');
            }
            if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2003') {
                throw new BadRequestException(`Category with id:${dto.categoryId} or shop with id:${dto.shopId} not found!`);
            }
            throw e;
        }
    };

    async findAll() {
        return await this.prisma.product.findMany({
            where: { isActive: true },
            include: { variants: true, category: true },
            orderBy: { createdAt: 'desc' },
        });
    };

    async findOne(id: number) {
        const product = await this.prisma.product.findUnique({
            where: { id: id },
            include: { variants: true, category: true, shop: true },
        });

        if (!product) {
            throw new NotFoundException(`Product with id:${id} not found!`);
        }
        return product;
    };

    async update(id: number, dto: UpdateProductDto) {
        const { variants, ...productData } = dto;

        const data: Prisma.ProductUncheckedUpdateInput = { ...productData };

        if (variants) {
            data.variants = this.buildVariantChanges(variants);
        }

        try {
            return await this.prisma.product.update({
                where: { id: id },
                data: data,
                include: { variants: true },
            });
        } catch (e) {
            if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2025') {
                throw new NotFoundException(`Product with id:${id} or one of its variants not found!`);
            }
            if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
                throw new BadRequestException('Duplicate slug, sku or ml value!');
            }
            if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2003') {
                throw new BadRequestException(`Category with id:${dto.categoryId} or shop with id:${dto.shopId} not found!`);
            }
            throw e;
        };
    };

    async remove(id: number) {
        try {
            return await this.prisma.product.delete({
                where: { id: id },
            });
        } catch (e) {
            if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2025') {
                throw new NotFoundException(`Product with id:${id} not found!`);
            }
            throw e;
        }
    };

    private buildVariantChanges(
        changes: VariantChangesDto,
    ): Prisma.ProductUncheckedUpdateInput['variants'] {
        return {
            create: changes.create,
            update: changes.update?.map(({ id, ...variantData }) => ({
                where: { id: id },
                data: variantData,
            })),
            delete: changes.delete?.map((variantId) => ({ id: variantId })),
        };
    }
}
