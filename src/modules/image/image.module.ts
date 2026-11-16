import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { ImageService } from './image.service';
import { ImageStorage } from './image-storage';

@Module({
  imports: [PrismaModule],
  providers: [ImageService, ImageStorage],
  exports: [ImageService],
})
export class ImageModule {}
