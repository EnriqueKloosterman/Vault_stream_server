import { Test, TestingModule } from '@nestjs/testing';
import { LibraryController } from './library.controller.js';
import { LibraryService } from './library.service.js';
import { ScannerService } from './scanner.service.js';

describe('LibraryController', () => {
  let controller: LibraryController;

  const libraryService = { list: vi.fn(), seriesDetail: vi.fn() };
  const scannerService = { scan: vi.fn(), getStatus: vi.fn() };

  const user = { userId: 'u1', email: 'a@b.c' };

  beforeEach(async () => {
    vi.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [LibraryController],
      providers: [
        { provide: LibraryService, useValue: libraryService },
        { provide: ScannerService, useValue: scannerService },
      ],
    }).compile();

    controller = module.get<LibraryController>(LibraryController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('list aplica paginación por defecto', async () => {
    libraryService.list.mockResolvedValue({ items: [], total: 0, page: 1, limit: 20 });

    await controller.list(user, {});

    expect(libraryService.list).toHaveBeenCalledWith('u1', {
      page: 1,
      limit: 20,
      type: undefined,
      q: undefined,
    });
  });

  it('scan delega en ScannerService', async () => {
    scannerService.scan.mockResolvedValue({ status: 'started' });

    const result = await controller.scan(user, { prefixes: ['Movies'] });

    expect(result).toEqual({ status: 'started' });
    expect(scannerService.scan).toHaveBeenCalledWith('u1', ['Movies']);
  });

  it('status devuelve el estado', () => {
    scannerService.getStatus.mockReturnValue({ scanning: false, processed: 0 });

    expect(controller.status(user)).toEqual({
      scanning: false,
      processed: 0,
    });
    expect(scannerService.getStatus).toHaveBeenCalledWith('u1');
  });
});
