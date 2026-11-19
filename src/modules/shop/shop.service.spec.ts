import { NotFoundException } from '@nestjs/common';
import { ShopService } from './shop.service';
import { PrismaService } from '../prisma/prisma.service';
import { ImageService } from '../image/image.service';
import { AuthUser } from '../../common/decorators/current-user.decorator';
import { Status } from '../../../generated/prisma/enums';

const user: AuthUser = { id: 1, username: 'seller', role: 'ADMIN' };

describe('ShopService removal', () => {
  const db = {
    shop: {
      findFirst: jest.fn(),
      delete: jest.fn(),
      update: jest.fn(),
    },
  };
  const imageService = { deleteQueuedFiles: jest.fn() };
  let service: ShopService;

  beforeEach(() => {
    jest.resetAllMocks();
    service = new ShopService(
      db as unknown as PrismaService,
      imageService as unknown as ImageService,
    );
  });

  it('rejects removing a shop not owned by the user', async () => {
    db.shop.findFirst.mockResolvedValue(null);
    await expect(service.remove(2, user)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(db.shop.delete).not.toHaveBeenCalled();
  });

  it('suspends a shop when any of its products has stock history', async () => {
    db.shop.findFirst.mockResolvedValue({ products: [{ id: 10 }] });
    db.shop.update.mockResolvedValue({ id: 2, status: Status.SUSPENDED });
    await expect(service.remove(2, user)).resolves.toEqual({
      id: 2,
      status: Status.SUSPENDED,
    });
    expect(db.shop.delete).not.toHaveBeenCalled();
    expect(db.shop.update).toHaveBeenCalledWith({
      where: { id: 2, AND: [{ ownerId: 1 }] },
      data: { status: Status.SUSPENDED },
    });
  });

  it('deletes a shop with no stock history and cleans up queued files', async () => {
    db.shop.findFirst.mockResolvedValue({ products: [] });
    db.shop.delete.mockResolvedValue({ id: 2 });
    await service.remove(2, user);
    expect(db.shop.delete).toHaveBeenCalledWith({
      where: { id: 2, AND: [{ ownerId: 1 }] },
    });
    expect(imageService.deleteQueuedFiles).toHaveBeenCalled();
  });
});
