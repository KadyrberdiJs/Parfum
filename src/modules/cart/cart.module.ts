import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { CartService } from './cart.service';
import { CartController } from './cart.controller';
import { CartSession } from './cart-session';
import { CartRequestGuard } from './cart-request.guard';
@Module({
  imports: [PrismaModule],
  controllers: [CartController],
  providers: [CartService, CartSession, CartRequestGuard],
})
export class CartModule {}
