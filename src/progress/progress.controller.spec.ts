import { Test, TestingModule } from '@nestjs/testing';
import { ProgressController } from './progress.controller.js';
import { ProgressService } from './progress.service.js';

describe('ProgressController', () => {
  let controller: ProgressController;

  const progressService = { list: vi.fn(), apply: vi.fn() };

  const user = { userId: 'u1', email: 'a@b.c' };

  beforeEach(async () => {
    vi.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ProgressController],
      providers: [{ provide: ProgressService, useValue: progressService }],
    }).compile();

    controller = module.get<ProgressController>(ProgressController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('list delega en el servicio', async () => {
    progressService.list.mockResolvedValue([]);

    await controller.list(user, {});

    expect(progressService.list).toHaveBeenCalledWith('u1', undefined, undefined);
  });

  it('list pasa filtros itemType y refId', async () => {
    progressService.list.mockResolvedValue([]);

    await controller.list(user, { itemType: 'movie', refId: 'x' });

    expect(progressService.list).toHaveBeenCalledWith('u1', 'movie', 'x');
  });

  it('save delega en apply', async () => {
    progressService.apply.mockResolvedValue({ updated: 1, skipped: 0 });

    const result = await controller.save(user, { updates: [] });

    expect(result).toEqual({ updated: 1, skipped: 0 });
    expect(progressService.apply).toHaveBeenCalledWith('u1', { updates: [] });
  });

  it('patch delega en apply', async () => {
    progressService.apply.mockResolvedValue({ updated: 0, skipped: 1 });

    const result = await controller.patch(user, {});

    expect(result).toEqual({ updated: 0, skipped: 1 });
    expect(progressService.apply).toHaveBeenCalledWith('u1', {});
  });
});
