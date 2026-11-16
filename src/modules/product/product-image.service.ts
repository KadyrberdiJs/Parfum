import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '../../../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ImageService } from '../image/image.service';
import { StoredFile } from '../image/image-storage';
import { MAX_IMAGES_PER_OWNER, publicImageFields } from '../image/image-links';
import { ownedProductWhere } from '../../common/auth/ownership';
import { AuthUser } from '../../common/decorators/current-user.decorator';

export const orderedImages = {
  orderBy: { position: 'asc' },
  select: { image: { select: publicImageFields } },
} satisfies Prisma.Product$imagesArgs;

@Injectable()
export class ProductImageService {
  constructor(
    private prisma: PrismaService,
    private imageService: ImageService,
  ) {}

  // Optimizes the uploaded files and appends them to the end of the product's gallery.
  async addImages(
    productId: number,
    files: Express.Multer.File[],
    user: AuthUser,
  ) {
    if (files.length === 0) {
      throw new BadRequestException('Attach at least one image');
    }
    const gallery = await this.findOwnedGallery(productId, user);
    if (gallery.length + files.length > MAX_IMAGES_PER_OWNER) {
      throw new BadRequestException(
        `A product can have at most ${MAX_IMAGES_PER_OWNER} images`,
      );
    }

    const storedFiles = await this.imageService.storeOptimized(files);
    const nextPosition = (gallery.at(-1)?.position ?? -1) + 1;
    try {
      await this.linkImages(productId, storedFiles, nextPosition);
    } catch (error) {
      await this.imageService.discard(storedFiles);
      throw error;
    }
    return this.listImages(productId);
  }

  // Removes one image from the product's gallery; the database then deletes the unused image and queues its file.
  async removeImage(productId: number, imageId: number, user: AuthUser) {
    await this.findOwnedGallery(productId, user);
    const { count } = await this.prisma.productImage.deleteMany({
      where: { productId, imageId },
    });
    if (count === 0) {
      throw new NotFoundException(
        `Image with id:${imageId} not found on product with id:${productId}!`,
      );
    }
    await this.imageService.deleteQueuedFiles();
    return this.listImages(productId);
  }

  private async findOwnedGallery(productId: number, user: AuthUser) {
    const product = await this.prisma.product.findFirst({
      where: { id: productId, AND: [ownedProductWhere(user)] },
      select: {
        images: { orderBy: { position: 'asc' }, select: { position: true } },
      },
    });
    if (!product) {
      throw new NotFoundException(`Product with id:${productId} not found!`);
    }
    return product.images;
  }

  private async linkImages(
    productId: number,
    storedFiles: StoredFile[],
    firstPosition: number,
  ) {
    await this.prisma.product.update({
      where: { id: productId },
      data: {
        images: {
          create: storedFiles.map((file, index) => ({
            position: firstPosition + index,
            image: { create: file },
          })),
        },
      },
    });
  }

  private async listImages(productId: number) {
    const links = await this.prisma.productImage.findMany({
      where: { productId },
      ...orderedImages,
    });
    return links.map((link) => link.image);
  }
}
