import { UsersController } from './users.controller';
import { UsersService } from './users.service';
describe('UsersController', () => {
  it('derives the profile ID from the authenticated user', async () => {
    const update = jest.fn();
    const controller = new UsersController({
      update,
    } as unknown as UsersService);
    await controller.updateMe(
      { id: 7, username: 'user', role: 'CUSTOMER' },
      { fullName: 'New Name' },
    );
    expect(update).toHaveBeenCalledWith(7, { fullName: 'New Name' });
  });
});
