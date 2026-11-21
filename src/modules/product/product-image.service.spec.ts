import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Prisma } from '../../../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ImageService } from '../image/image.service';
import { AuthUser } from '../../common/decorators/current-user.decorator';
import { ProductImageService } from './product-image.service';

const user: AuthUser = { id: 1, username: 'seller', role: 'ADMIN' };
const file = { originalname: 'a.png', buffer: Buffer.from('') };
const storedFile = {
  storageKey: 'images/a.png',
  url: '/uploads/images/a.png',
};

describe('ProductImageService', () => {
  const db = {
    product: { findFirst: jest.fn(), update: jest.fn() },
    productImage: {
      findMany: jest.fn(),
      deleteMany: jest.fn(),
      update: jest.fn(),
    },
    $transaction: jest.fn(),
  };
  const imageService = {
    storeUploads: jest.fn(),
    enqueueOptimization: jest.fn(),
    discard: jest.fn(),
    deleteQueuedFiles: jest.fn(),
  };
  let service: ProductImageService;
  beforeEach(() => {
    jest.resetAllMocks();
    db.productImage.findMany.mockResolvedValue([]);
    db.product.update.mockResolvedValue({
      images: [{ imageId: 12, image: { storageKey: storedFile.storageKey } }],
    });
    db.$transaction.mockImplementation(
      (fn: (tx: unknown) => Promise<unknown>) => fn(db),
    );
    imageService.storeUploads.mockResolvedValue([storedFile]);
    service = new ProductImageService(
      db as unknown as PrismaService,
      imageService as unknown as ImageService,
    );
  });

  it('appends uploads after the last image inside a serializable transaction and enqueues optimization', async () => {
    db.product.findFirst.mockResolvedValue({
      images: [
        { imageId: 10, position: 0 },
        { imageId: 11, position: 4 },
      ],
    });
    await service.addImages(5, [file as Express.Multer.File], user);
    expect(db.$transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    });
    expect(db.product.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 5, AND: [{ shop: { ownerId: 1 } }] },
      }),
    );
    expect(db.product.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 5 },
        data: {
          images: { create: [{ position: 5, image: { create: storedFile } }] },
        },
      }),
    );
    expect(imageService.enqueueOptimization).toHaveBeenCalledWith([
      { imageId: 12, storageKey: storedFile.storageKey },
    ]);
  });

  it('rejects uploads for products the user does not own', async () => {
    db.product.findFirst.mockResolvedValue(null);
    await expect(
      service.addImages(5, [file as Express.Multer.File], user),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(imageService.storeUploads).not.toHaveBeenCalled();
    expect(imageService.enqueueOptimization).not.toHaveBeenCalled();
  });

  it('rejects uploads that would exceed the gallery limit', async () => {
    db.product.findFirst.mockResolvedValue({
      images: Array.from({ length: 20 }, (_, position) => ({
        imageId: position + 1,
        position,
      })),
    });
    await expect(
      service.addImages(5, [file as Express.Multer.File], user),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(imageService.storeUploads).not.toHaveBeenCalled();
    expect(imageService.enqueueOptimization).not.toHaveBeenCalled();
  });

  it('discards uploaded files when a concurrent upload fills the gallery', async () => {
    db.product.findFirst
      .mockResolvedValueOnce({
        images: Array.from({ length: 19 }, (_, position) => ({
          imageId: position + 1,
          position,
        })),
      })
      .mockResolvedValueOnce({
        images: Array.from({ length: 20 }, (_, position) => ({
          imageId: position + 1,
          position,
        })),
      });
    await expect(
      service.addImages(5, [file as Express.Multer.File], user),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(imageService.discard).toHaveBeenCalledWith([storedFile]);
    expect(imageService.enqueueOptimization).not.toHaveBeenCalled();
    expect(db.product.update).not.toHaveBeenCalled();
  });

  it('removes stored files when linking them fails', async () => {
    db.product.findFirst.mockResolvedValue({ images: [] });
    db.product.update.mockRejectedValue(new Error('database down'));
    await expect(
      service.addImages(5, [file as Express.Multer.File], user),
    ).rejects.toThrow('database down');
    expect(imageService.discard).toHaveBeenCalledWith([storedFile]);
    expect(imageService.enqueueOptimization).not.toHaveBeenCalled();
  });

  it('reorders product images when every gallery image is listed once', async () => {
    db.product.findFirst.mockResolvedValue({
      images: [
        { imageId: 10, position: 0 },
        { imageId: 20, position: 1 },
      ],
    });
    await service.reorderImages(5, [20, 10], user);
    expect(db.productImage.update).toHaveBeenNthCalledWith(1, {
      where: { productId_imageId: { productId: 5, imageId: 20 } },
      data: { position: 0 },
    });
    expect(db.productImage.update).toHaveBeenNthCalledWith(2, {
      where: { productId_imageId: { productId: 5, imageId: 10 } },
      data: { position: 1 },
    });
  });

  it('rejects reordering when an image is missing or foreign', async () => {
    db.product.findFirst.mockResolvedValue({
      images: [
        { imageId: 10, position: 0 },
        { imageId: 20, position: 1 },
      ],
    });
    await expect(service.reorderImages(5, [10], user)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(
      service.reorderImages(5, [10, 99], user),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(db.productImage.update).not.toHaveBeenCalled();
  });

  it('unlinks an image and removes its queued file', async () => {
    db.product.findFirst.mockResolvedValue({
      images: [{ imageId: 7, position: 0 }],
    });
    db.productImage.deleteMany.mockResolvedValue({ count: 1 });
    await service.removeImage(5, 7, user);
    expect(db.productImage.deleteMany).toHaveBeenCalledWith({
      where: { productId: 5, imageId: 7 },
    });
    expect(imageService.deleteQueuedFiles).toHaveBeenCalled();
  });

  it('reports an image that is not on the product', async () => {
    db.product.findFirst.mockResolvedValue({ images: [] });
    db.productImage.deleteMany.mockResolvedValue({ count: 0 });
    await expect(service.removeImage(5, 7, user)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
