import { Test, TestingModule } from '@nestjs/testing';
import { MediaController } from './media.controller.js';
import { MediaService } from './media.service.js';

describe('MediaController', () => {
  let controller: MediaController;

  const mediaService = {
    presign: vi.fn(),
    subtitle: vi.fn(),
  };

  const user = { userId: 'u1', email: 'a@b.c' };

  beforeEach(async () => {
    vi.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [MediaController],
      providers: [{ provide: MediaService, useValue: mediaService }],
    }).compile();

    controller = module.get<MediaController>(MediaController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('presign delega en MediaService', async () => {
    mediaService.presign.mockResolvedValue({ url: 'u', expiresIn: 600 });

    const result = await controller.presign(user, { r2Key: 'k' });

    expect(result).toEqual({ url: 'u', expiresIn: 600 });
    expect(mediaService.presign).toHaveBeenCalledWith('u1', 'k');
  });

  it('subtitle delega en MediaService', async () => {
    mediaService.subtitle.mockResolvedValue({ url: 'u', expiresIn: 600 });

    const result = await controller.subtitle(user, { subtitleKey: 's' });

    expect(result).toEqual({ url: 'u', expiresIn: 600 });
    expect(mediaService.subtitle).toHaveBeenCalledWith('u1', 's');
  });
});
