import { ProductController } from './product.controller';
import { ProductStockService } from './product-stock.service';
import { ProductService } from './product.service';
describe('ProductController', () => {
  it('passes the authenticated user to creation', async () => {
    const create = jest.fn();
    const controller = new ProductController(
      {
        create,
      } as unknown as ProductService,
      {} as ProductStockService,
    );
    const dto = {
      name: 'Perfume',
      slug: 'perfume',
      shopId: 2,
      categoryId: 1,
      variants: [{ ml: 50, price: 20 }],
    };
    const user = { id: 1, username: 'seller', role: 'ADMIN' as const };
    await controller.create(dto, user);
    expect(create).toHaveBeenCalledWith(dto, user);
  });
});
