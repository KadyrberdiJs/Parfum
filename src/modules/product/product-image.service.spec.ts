import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ImageService } from '../image/image.service';
import { AuthUser } from '../../common/decorators/current-user.decorator';
import { ProductImageService } from './product-image.service';

const user: AuthUser = { id: 1, username: 'seller', role: 'ADMIN' };
const file = { originalname: 'a.png', buffer: Buffer.from('') };
const storedFile = {
  storageKey: 'images/a.avif',
  url: '/uploads/images/a.avif',
};

describe('ProductImageService', () => {
  const db = {
    product: { findFirst: jest.fn(), update: jest.fn() },
    productImage: { findMany: jest.fn(), deleteMany: jest.fn() },
  };
  const imageService = {
    storeOptimized: jest.fn(),
    discard: jest.fn(),
    deleteQueuedFiles: jest.fn(),
  };
  let service: ProductImageService;
  beforeEach(() => {
    jest.resetAllMocks();
    db.productImage.findMany.mockResolvedValue([]);
    imageService.storeOptimized.mockResolvedValue([storedFile]);
    service = new ProductImageService(
      db as unknown as PrismaService,
      imageService as unknown as ImageService,
    );
  });

  it('appends uploads after the last image of an owned product', async () => {
    db.product.findFirst.mockResolvedValue({
      images: [{ position: 0 }, { position: 4 }],
    });
    await service.addImages(5, [file as Express.Multer.File], user);
    expect(db.product.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 5, AND: [{ shop: { ownerId: 1 } }] },
      }),
    );
    expect(db.product.update).toHaveBeenCalledWith({
      where: { id: 5 },
      data: {
        images: { create: [{ position: 5, image: { create: storedFile } }] },
      },
    });
  });

  it('rejects uploads for products the user does not own', async () => {
    db.product.findFirst.mockResolvedValue(null);
    await expect(
      service.addImages(5, [file as Express.Multer.File], user),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(imageService.storeOptimized).not.toHaveBeenCalled();
  });

  it('rejects uploads that would exceed the gallery limit', async () => {
    db.product.findFirst.mockResolvedValue({
      images: Array.from({ length: 20 }, (_, position) => ({ position })),
    });
    await expect(
      service.addImages(5, [file as Express.Multer.File], user),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(imageService.storeOptimized).not.toHaveBeenCalled();
  });

  it('removes stored files when linking them fails', async () => {
    db.product.findFirst.mockResolvedValue({ images: [] });
    db.product.update.mockRejectedValue(new Error('database down'));
    await expect(
      service.addImages(5, [file as Express.Multer.File], user),
    ).rejects.toThrow('database down');
    expect(imageService.discard).toHaveBeenCalledWith([storedFile]);
  });

  it('unlinks an image and removes its queued file', async () => {
    db.product.findFirst.mockResolvedValue({ images: [{ position: 0 }] });
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
