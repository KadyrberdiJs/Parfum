import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateShopDto } from './dto/create-shop.dto';
import { Prisma } from 'generated/prisma/client';
import { UpdateShopDto } from './dto/update-shop.dto';

@Injectable()
export class ShopService {
    constructor(private prisma: PrismaService) {};

    async create(dto: CreateShopDto) {
        return await this.prisma.shop.create({
            data: {...dto}
        })
    };

    async findAll() {
        return await this.prisma.shop.findMany({
            orderBy: { createdAt: 'desc'}
        })
    };

    async findOne(id: number) {
        const shop = await this.prisma.shop.findUnique({
            where: { id: id }
        });

        if (!shop) {
            throw new NotFoundException(`Show with id:${id} not found!`)
        }
        return shop;
    };

    async update(id: number, dto: UpdateShopDto) {
        const data: Prisma.ShopUpdateInput = { ...dto }

        try {
            return await this.prisma.shop.update({
                where: { id: id },
                data: data
            })
        } catch (e) {
            if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2025') {
            throw new NotFoundException(`Shop with id:${id} not found!`);
        }
        throw e;
        };
    };

    async remove(id: number) {
        try {
            return await this.prisma.shop.delete({
                where: { id: id }
            })
        } catch (e) {
            if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2025') {
            throw new NotFoundException(`Shop with id:${id} not found!`);
        }
        throw e;
        }
    };
}
