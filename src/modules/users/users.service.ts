import { ConflictException, Injectable, InternalServerErrorException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateUserDto } from './dto/create-user.dto';
import bcrypt from 'bcryptjs';
import { UpdateUserDto } from './dto/update-user.dto';
import { Prisma } from 'generated/prisma/client';


const USER_PUBLIC_FIELDS = {
  id: true,
  email: true,
  username: true,
  fullName: true,
  role: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
};

@Injectable()
export class UsersService {
    constructor(private prisma: PrismaService) {}
    
    async create(dto: CreateUserDto) {
        const {password, ...rest} = dto;

        const hashed = await bcrypt.hash(dto.password, 10);

        return await this.prisma.user.create({
            data: { ...rest, password: hashed },
            select: USER_PUBLIC_FIELDS,
        })
   };

   async findAll() {
        return await this.prisma.user.findMany({
            select: USER_PUBLIC_FIELDS,
            orderBy: { createdAt: 'desc'},
        })
   };

   async findOne(id: number) {
        const user = await this.prisma.user.findUnique({
            where: {id: id},
            select: USER_PUBLIC_FIELDS,
        });

        if (!user) {
            throw new NotFoundException(`User with id:${id} not found!`);
        };

        return user;
   };

   async update(id: number, dto: UpdateUserDto) {
        const data: Prisma.UserUpdateInput = { ...dto };

        if (dto.password) {
            data.password = await bcrypt.hash(dto.password, 10);
        }
        try {
            return await this.prisma.user.update({
                where: { id },
                data: data,
                select: USER_PUBLIC_FIELDS
            })
        } catch (e) {
            if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2025') {
            throw new NotFoundException(`User with id:${id} not found!`);
        }
        throw e;
        };
    }

   async remove(id: number) {
        try {
            return await this.prisma.user.delete({
                where: { id: id },
                select: USER_PUBLIC_FIELDS,
            })
        } catch (e) {
            if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2025') {
            throw new NotFoundException(`User with id:${id} not found!`);
        }
        throw e;
        }
   };
}
