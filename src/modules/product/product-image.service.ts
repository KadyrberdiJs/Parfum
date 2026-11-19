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

type GalleryClient = Pick<Prisma.TransactionClient, 'product' | 'productImage'>;

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
    const initialGallery = await this.findOwnedGallery(
      this.prisma,
      productId,
      user,
    );
    this.ensureRoomFor(initialGallery.length, files.length);

    const storedFiles = await this.imageService.storeOptimized(files);
    try {
      await this.prisma.$transaction(
        async (transaction) => {
          const gallery = await this.findOwnedGallery(
            transaction,
            productId,
            user,
          );
          this.ensureRoomFor(gallery.length, files.length);
          const nextPosition = (gallery.at(-1)?.position ?? -1) + 1;
          await this.linkImages(
            transaction,
            productId,
            storedFiles,
            nextPosition,
          );
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error) {
      await this.imageService.discard(storedFiles);
      throw error;
    }
    return this.listImages(productId);
  }

  async reorderImages(productId: number, imageIds: number[], user: AuthUser) {
    await this.prisma.$transaction(
      async (transaction) => {
        const gallery = await this.findOwnedGallery(
          transaction,
          productId,
          user,
        );
        this.ensureSameImages(
          gallery.map((link) => link.imageId),
          imageIds,
        );
        for (const [position, imageId] of imageIds.entries()) {
          await transaction.productImage.update({
            where: { productId_imageId: { productId, imageId } },
            data: { position },
          });
        }
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
    return this.listImages(productId);
  }

  // Removes one image from the product's gallery; the database then deletes the unused image and queues its file.
  async removeImage(productId: number, imageId: number, user: AuthUser) {
    await this.findOwnedGallery(this.prisma, productId, user);
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

  private ensureRoomFor(currentCount: number, addedCount: number) {
    if (currentCount + addedCount > MAX_IMAGES_PER_OWNER) {
      throw new BadRequestException(
        `A product can have at most ${MAX_IMAGES_PER_OWNER} images`,
      );
    }
  }

  private ensureSameImages(currentIds: number[], requestedIds: number[]) {
    const currentSet = new Set(currentIds);
    const hasSameMembers =
      currentIds.length === requestedIds.length &&
      requestedIds.every((id) => currentSet.has(id));
    if (!hasSameMembers) {
      throw new BadRequestException(
        'imageIds must include every image of the product exactly once',
      );
    }
  }

  private async findOwnedGallery(
    client: GalleryClient,
    productId: number,
    user: AuthUser,
  ) {
    const product = await client.product.findFirst({
      where: { id: productId, AND: [ownedProductWhere(user)] },
      select: {
        images: {
          orderBy: { position: 'asc' },
          select: { imageId: true, position: true },
        },
      },
    });
    if (!product) {
      throw new NotFoundException(`Product with id:${productId} not found!`);
    }
    return product.images;
  }

  private async linkImages(
    client: GalleryClient,
    productId: number,
    storedFiles: StoredFile[],
    firstPosition: number,
  ) {
    await client.product.update({
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
