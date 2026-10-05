import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { R2Service } from '../infra/r2/r2.service.js';
import { LibraryService } from '../library/library.service.js';
import { MediaService } from './media.service.js';

describe('MediaService', () => {
  let service: MediaService;

  const library = {
    findOwnedKey: vi.fn(),
    keyExists: vi.fn(),
    findOwnedSubtitle: vi.fn(),
  };
  const r2 = { presignGet: vi.fn() };

  const userId = '507f1f77bcf86cd799439011';

  beforeEach(async () => {
    vi.clearAllMocks();
    r2.presignGet.mockResolvedValue({ url: 'https://r2/x', expiresIn: 600 });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MediaService,
        { provide: LibraryService, useValue: library },
        { provide: R2Service, useValue: r2 },
      ],
    }).compile();

    service = module.get<MediaService>(MediaService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('presign si el recurso pertenece al usuario', async () => {
    library.findOwnedKey.mockResolvedValue(true);

    const result = await service.presign(userId, 'Movies/a.mp4');

    expect(result).toEqual({ url: 'https://r2/x', expiresIn: 600 });
    expect(r2.presignGet).toHaveBeenCalledWith('Movies/a.mp4');
  });

  it('presign lanza 403 si existe pero no es del usuario', async () => {
    library.findOwnedKey.mockResolvedValue(false);
    library.keyExists.mockResolvedValue(true);

    await expect(service.presign(userId, 'Movies/a.mp4')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(r2.presignGet).not.toHaveBeenCalled();
  });

  it('presign lanza 404 si no existe', async () => {
    library.findOwnedKey.mockResolvedValue(false);
    library.keyExists.mockResolvedValue(false);

    await expect(service.presign(userId, 'nope.mp4')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('subtitle valida y firma', async () => {
    library.findOwnedSubtitle.mockResolvedValue(true);

    const result = await service.subtitle(userId, 'Movies/a.srt');

    expect(result).toEqual({ url: 'https://r2/x', expiresIn: 600 });
    expect(r2.presignGet).toHaveBeenCalledWith('Movies/a.srt');
  });

  it('subtitle lanza 404 si no pertenece', async () => {
    library.findOwnedSubtitle.mockResolvedValue(false);

    await expect(service.subtitle(userId, 'nope.srt')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
