import { ProductStockService } from './product-stock.service';
import { Module } from '@nestjs/common';
import { ProductService } from './product.service';
import { ProductController } from './product.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { ImageModule } from '../image/image.module';
import { ProductImageService } from './product-image.service';

@Module({
  imports: [PrismaModule, ImageModule],
  providers: [ProductService, ProductStockService, ProductImageService],
  controllers: [ProductController],
})
export class ProductModule {}
