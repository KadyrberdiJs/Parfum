import { ConflictException, Injectable, InternalServerErrorException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateUserDto } from './dto/create-user.dto';
import bcrypt from 'bcryptjs';
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

        try {
            return await this.prisma.user.create({
                data: {
                    ...rest,
                    password: hashed
                },
                select: USER_PUBLIC_FIELDS
            })
        } catch (error) {
            if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
            throw new ConflictException('Email or Username is already taken.');
            }
            throw new InternalServerErrorException('Failed to create user.');
        }
   }
}
