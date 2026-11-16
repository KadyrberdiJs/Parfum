import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import request from 'supertest';
import type { App } from 'supertest/types';
import { createHash } from 'crypto';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/modules/prisma/prisma.service';
import { setupApp } from '../src/setup-app';

// Real routing, guards, strategies and validation; database calls are mocked.
describe('HTTP security contracts', () => {
  let app: INestApplication<App>;
  const jwt = new JwtService({ secret: process.env.JWT_SECRET });
  const db = {
    user: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    product: {
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
    },
    shop: { findFirst: jest.fn(), create: jest.fn() },
    refreshToken: { deleteMany: jest.fn() },
    imageFileDeletion: { findMany: jest.fn().mockResolvedValue([]) },
  };
  const access = (sub = 1, role = 'ADMIN') =>
    jwt.sign({ sub, role, type: 'access' }, { expiresIn: '15m' });
  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue(db)
      .compile();
    app = module.createNestApplication();
    setupApp(app);
    await app.init();
  });
  beforeEach(() => {
    jest.resetAllMocks();
    db.user.findUnique.mockImplementation(
      (args: { where: { id?: number } }) => {
        const id = args.where.id;
        if (!id || id === 99) return Promise.resolve(null);
        return Promise.resolve({
          id,
          username: 'test',
          role: id === 1 ? 'ADMIN' : 'CUSTOMER',
          isActive: id !== 3,
        });
      },
    );
    db.shop.findFirst.mockResolvedValue(null);
    db.refreshToken.deleteMany.mockResolvedValue({ count: 1 });
  });
  afterAll(async () => {
    await app.close();
  });
  it('keeps the root route public', () =>
    request(app.getHttpServer()).get('/').expect(200));
  it.each(['/users/1', '/shops/1', '/categories/1', '/products/1'])(
    'rejects anonymous PATCH %s',
    (url) => request(app.getHttpServer()).patch(url).send({}).expect(401),
  );
  it.each(['/users/1', '/shops/1', '/categories/1', '/products/1'])(
    'rejects anonymous DELETE %s',
    (url) => request(app.getHttpServer()).delete(url).expect(401),
  );
  it('protects the user directory', () =>
    request(app.getHttpServer()).get('/users').expect(401));
  it('uses the current database role instead of a stale ADMIN claim', () =>
    request(app.getHttpServer())
      .post('/products')
      .auth(access(2, 'ADMIN'), { type: 'bearer' })
      .send({})
      .expect(403));
  it.each([3, 99])('rejects inactive or deleted user %s with 401', (id) =>
    request(app.getHttpServer())
      .get('/users/me')
      .auth(access(id), { type: 'bearer' })
      .expect(401),
  );
  it('rejects creating a product in another shop', async () => {
    await request(app.getHttpServer())
      .post('/products')
      .auth(access(), { type: 'bearer' })
      .send({
        name: 'Perfume',
        slug: 'perfume',
        categoryId: 1,
        shopId: 9,
        variants: [{ ml: 50, price: 20 }],
      })
      .expect(403);
    expect(db.product.create).not.toHaveBeenCalled();
  });
  it('rejects invalid nested variant data', () =>
    request(app.getHttpServer())
      .post('/products')
      .auth(access(), { type: 'bearer' })
      .send({
        name: 'Perfume',
        slug: 'perfume',
        categoryId: 1,
        shopId: 9,
        variants: [{ ml: 0, price: -1 }],
      })
      .expect(400));
  it('rejects shop transfers through ordinary product updates', () =>
    request(app.getHttpServer())
      .patch('/products/1')
      .auth(access(), { type: 'bearer' })
      .send({ shopId: 9 })
      .expect(400));
  it('rejects password changes through profile updates', () =>
    request(app.getHttpServer())
      .patch('/users/me')
      .auth(access(2), { type: 'bearer' })
      .send({ password: 'new-password' })
      .expect(400));
  it('rejects forged shop owners', () =>
    request(app.getHttpServer())
      .post('/shops')
      .auth(access(), { type: 'bearer' })
      .send({
        name: 'Shop',
        slug: 'shop',
        email: 'shop@example.com',
        ownerId: 9,
      })
      .expect(400));
  it('rejects null for required product fields', () =>
    request(app.getHttpServer())
      .patch('/products/1')
      .auth(access(), { type: 'bearer' })
      .send({ name: null })
      .expect(400));
  it('bounds pagination', () =>
    request(app.getHttpServer()).get('/products?limit=10000').expect(400));
  it('logs out with a refresh token, not an access token', async () => {
    const refreshToken = jwt.sign(
      { sub: 1, type: 'refresh' },
      { expiresIn: '30d' },
    );
    await request(app.getHttpServer())
      .post('/auth/logout')
      .auth(access(), { type: 'bearer' })
      .expect(401);
    await request(app.getHttpServer())
      .post('/auth/logout')
      .auth(refreshToken, { type: 'bearer' })
      .expect(200);
    expect(db.refreshToken.deleteMany).toHaveBeenCalledWith({
      where: {
        tokenHash: createHash('sha256').update(refreshToken).digest('hex'),
      },
    });
  });
  it('rate limits repeated login attempts', async () => {
    for (let i = 0; i < 10; i++)
      await request(app.getHttpServer())
        .post('/auth/login')
        .send({ username: 'missing', password: 'password' })
        .expect(401);
    await request(app.getHttpServer())
      .post('/auth/login')
      .send({ username: 'missing', password: 'password' })
      .expect(429);
  });
});
