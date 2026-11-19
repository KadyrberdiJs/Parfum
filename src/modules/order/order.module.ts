import { Module } from '@nestjs/common';
import { CartModule } from '../cart/cart.module';
import { PrismaModule } from '../prisma/prisma.module';
import { OrderController } from './order.controller';
import { OrderService } from './order.service';

@Module({
  imports: [PrismaModule, CartModule],
  controllers: [OrderController],
  providers: [OrderService],
})
export class OrderModule {}
