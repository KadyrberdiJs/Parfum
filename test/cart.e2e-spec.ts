import { BullRegistrar, getQueueToken } from '@nestjs/bullmq';
import { Test } from '@nestjs/testing';
import { ConflictException, INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { IMAGE_OPTIMIZATION_QUEUE } from '../src/modules/image/image.service';
import { PrismaService } from '../src/modules/prisma/prisma.service';
import { CartService } from '../src/modules/cart/cart.service';
import { setupApp } from '../src/setup-app';

describe('Cart HTTP contracts', () => {
  let app: INestApplication<App>;
  const token = 'b'.repeat(64);
  const empty = {
    id: null,
    items: [],
    total: '0.00',
    conflicts: [],
    hasAvailabilityIssues: false,
    expiresAt: null,
  };
  const carts = {
    read: jest.fn(),
    add: jest.fn(),
    merge: jest.fn(),
    setQuantity: jest.fn(),
    remove: jest.fn(),
    clear: jest.fn(),
  };
  const jwt = new JwtService({ secret: process.env.JWT_SECRET });
  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue({
        user: {
          findUnique: jest.fn().mockResolvedValue({
            id: 1,
            username: 'customer',
            role: 'CUSTOMER',
            isActive: true,
          }),
        },
        imageFileDeletion: { findMany: jest.fn().mockResolvedValue([]) },
      })
      .overrideProvider(CartService)
      .useValue(carts)
      .overrideProvider(BullRegistrar)
      .useValue({ onModuleInit: jest.fn() })
      .overrideProvider(getQueueToken(IMAGE_OPTIMIZATION_QUEUE))
      .useValue({ addBulk: jest.fn(), close: jest.fn() })
      .compile();
    app = module.createNestApplication();
    setupApp(app);
    await app.init();
  });
  beforeEach(() => {
    jest.clearAllMocks();
    carts.merge.mockReset();
    carts.read.mockResolvedValue(empty);
    carts.add.mockResolvedValue({ cart: empty, guestToken: token });
    carts.merge.mockResolvedValue(empty);
  });
  afterAll(async () => {
    await app.close();
  });
  it('allows guest reads and sends no-store', async () => {
    await request(app.getHttpServer())
      .get('/cart')
      .expect('Cache-Control', 'no-store')
      .expect(200);
    expect(carts.read).toHaveBeenCalledWith({ guestToken: undefined });
  });
  it('sets a guest cookie without exposing the secret in the body', async () => {
    const response = await request(app.getHttpServer())
      .post('/cart/items')
      .set('X-Cart-Request', '1')
      .send({ variantId: 11, quantity: 2 })
      .expect(201);
    expect(response.headers['set-cookie']).toEqual(
      expect.arrayContaining([expect.stringContaining(`guest_cart=${token}`)]),
    );
    expect(response.text).not.toContain(token);
  });
  it('requires the custom header and rejects malicious origins', async () => {
    await request(app.getHttpServer())
      .post('/cart/items')
      .send({ variantId: 11, quantity: 1 })
      .expect(403);
    await request(app.getHttpServer())
      .post('/cart/items')
      .set('X-Cart-Request', '1')
      .set('Origin', 'https://untrusted.example')
      .send({ variantId: 11, quantity: 1 })
      .expect(403);
    expect(carts.add).not.toHaveBeenCalled();
  });
  it('does not silently downgrade invalid authentication to a guest', async () => {
    await request(app.getHttpServer())
      .get('/cart')
      .auth('invalid', { type: 'bearer' })
      .expect(401);
    expect(carts.read).not.toHaveBeenCalled();
  });
  it('requires authentication on merge', () =>
    request(app.getHttpServer())
      .post('/cart/merge')
      .set('X-Cart-Request', '1')
      .expect(401));
  it('returns stock conflicts without clearing the guest cart cookie', async () => {
    carts.merge.mockRejectedValue(
      new ConflictException({ availableMl: 40, requestedMl: 50 }),
    );
    const access = jwt.sign({ sub: 1, type: 'access' });
    const response = await request(app.getHttpServer())
      .post('/cart/merge')
      .auth(access, { type: 'bearer' })
      .set('Cookie', `guest_cart=${token}`)
      .set('X-Cart-Request', '1')
      .expect(409);
    expect(response.headers['set-cookie']).toBeUndefined();
  });
});
