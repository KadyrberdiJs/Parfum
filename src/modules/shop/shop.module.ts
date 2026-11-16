import { Module } from '@nestjs/common';
import { ShopService } from './shop.service';
import { ShopController } from './shop.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { ImageModule } from '../image/image.module';

@Module({
  imports: [PrismaModule, ImageModule],
  providers: [ShopService],
  controllers: [ShopController],
})
export class ShopModule {}
