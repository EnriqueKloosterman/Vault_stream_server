import { Test, TestingModule } from '@nestjs/testing';
import { MaintenanceService } from '../maintenance/maintenance.service.js';
import { UsersController } from './users.controller.js';

describe('UsersController', () => {
  let controller: UsersController;

  const maintenanceService = {
    cascadeDeleteUser: vi.fn(),
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [UsersController],
      providers: [{ provide: MaintenanceService, useValue: maintenanceService }],
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

  it('deleteMe delega en MaintenanceService con el userId del token', async () => {
    maintenanceService.cascadeDeleteUser.mockResolvedValue({ deleted: true });

    const result = await controller.deleteMe({
      userId: 'u1',
      email: 'a@b.c',
    });

    expect(result).toEqual({ deleted: true });
    expect(maintenanceService.cascadeDeleteUser).toHaveBeenCalledWith('u1');
  });
});