import { ProductStockService } from './product-stock.service';
import { Module } from '@nestjs/common';
import { ProductService } from './product.service';
import { ProductController } from './product.controller';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  providers: [ProductService, ProductStockService],
  controllers: [ProductController],
})
export class ProductModule {}
