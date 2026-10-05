import { Test, TestingModule } from '@nestjs/testing';
import { DownloadsController } from './downloads.controller.js';
import { DownloadsService } from './downloads.service.js';

describe('DownloadsController', () => {
  let controller: DownloadsController;

  const downloadsService = {
    list: vi.fn(),
    start: vi.fn(),
    updateProgress: vi.fn(),
    complete: vi.fn(),
    remove: vi.fn(),
  };

  const user = { userId: 'u1', email: 'a@b.c' };

  beforeEach(async () => {
    vi.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [DownloadsController],
      providers: [{ provide: DownloadsService, useValue: downloadsService }],
    }).compile();

    controller = module.get<DownloadsController>(DownloadsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('list delega en el servicio', async () => {
    downloadsService.list.mockResolvedValue([]);

    await controller.list(user);

    expect(downloadsService.list).toHaveBeenCalledWith('u1');
  });

  it('start delega en el servicio', async () => {
    const payload = { downloadId: 'd1', url: 'u', expiresIn: 600, fileName: 'a.mp4' };
    downloadsService.start.mockResolvedValue(payload);

    const result = await controller.start(user, { itemType: 'movie', refId: 'r1' });

    expect(result).toEqual(payload);
    expect(downloadsService.start).toHaveBeenCalledWith('u1', {
      itemType: 'movie',
      refId: 'r1',
    });
  });

  it('progress delega updateProgress', async () => {
    downloadsService.updateProgress.mockResolvedValue({ progressPct: 30 });

    const result = await controller.progress(user, 'd1', { progressPct: 30 });

    expect(result).toEqual({ progressPct: 30 });
    expect(downloadsService.updateProgress).toHaveBeenCalledWith('u1', 'd1', 30);
  });

  it('complete delega con fileSize opcional', async () => {
    downloadsService.complete.mockResolvedValue({ status: 'completed' });

    await controller.complete(user, 'd1', { fileSize: 999 });

    expect(downloadsService.complete).toHaveBeenCalledWith('u1', 'd1', 999);
  });

  it('remove delega y devuelve deleted', async () => {
    downloadsService.remove.mockResolvedValue({ deleted: true });

    const result = await controller.remove(user, 'd1');

    expect(result).toEqual({ deleted: true });
    expect(downloadsService.remove).toHaveBeenCalledWith('u1', 'd1');
  });
});
