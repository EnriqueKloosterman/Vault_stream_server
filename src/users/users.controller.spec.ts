import { Test, TestingModule } from '@nestjs/testing';
import { UsersController } from './users.controller.js';

describe('UsersController', () => {
  let controller: UsersController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [UsersController],
    }).compile();

    controller = module.get<UsersController>(UsersController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('me devuelve el usuario del token', () => {
    const result = controller.me({ userId: 'u1', email: 'a@b.c' });

    expect(result).toEqual({ id: 'u1', email: 'a@b.c' });
  });
});
