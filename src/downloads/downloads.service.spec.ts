import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { R2Service } from '../infra/r2/r2.service.js';
import { LibraryService } from '../library/library.service.js';
import { DownloadsService } from './downloads.service.js';
import { Download } from './schemas/download.schema.js';

describe('DownloadsService', () => {
  let service: DownloadsService;

  const findResult = { exec: vi.fn(), sort: vi.fn() };
  findResult.sort.mockReturnValue(findResult);

  const model = {
    find: vi.fn(),
    findOne: vi.fn(),
    create: vi.fn(),
    deleteOne: vi.fn(),
    deleteMany: vi.fn(),
  };
  model.find.mockReturnValue(findResult);
  model.findOne.mockReturnValue(findResult);
  model.deleteMany.mockResolvedValue({ deletedCount: 0 });

  const library = { findVideoForDownload: vi.fn() };
  const r2 = { presignGet: vi.fn() };

  const userId = '507f1f77bcf86cd799439011';
  const refId = '507f1f77bcf86cd799439012';

  beforeEach(async () => {
    vi.clearAllMocks();
    model.find.mockReturnValue(findResult);
    model.findOne.mockReturnValue(findResult);
    findResult.exec.mockResolvedValue(null);
    r2.presignGet.mockResolvedValue({ url: 'https://r2/v', expiresIn: 600 });
    library.findVideoForDownload.mockResolvedValue({
      r2Key: 'Movies/a.mp4',
      fileName: 'a.mp4',
      fileSize: 1000,
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DownloadsService,
        { provide: getModelToken(Download.name), useValue: model },
        { provide: LibraryService, useValue: library },
        { provide: R2Service, useValue: r2 },
      ],
    }).compile();

    service = module.get<DownloadsService>(DownloadsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('list devuelve descargas del usuario', async () => {
    findResult.exec.mockResolvedValue([{ progressPct: 50 }]);

    const result = await service.list(userId);

    expect(result).toEqual([{ progressPct: 50 }]);
    expect(model.find).toHaveBeenCalledWith({ userId: expect.any(Object) });
    expect(findResult.sort).toHaveBeenCalledWith({ updatedAt: -1 });
  });

  it('start crea registro con expiración de 7 días', async () => {
    const created = { _id: '507f1f77bcf86cd799439099' };
    model.create.mockResolvedValue(created);

    const result = await service.start(userId, { itemType: 'movie', refId });

    expect(result).toEqual({
      downloadId: '507f1f77bcf86cd799439099',
      url: 'https://r2/v',
      expiresIn: 600,
      fileName: 'a.mp4',
      fileSize: 1000,
    });
    const doc = model.create.mock.calls[0][0];
    expect(doc.status).toBe('pending');
    expect(doc.expiresAt.getTime()).toBeGreaterThan(Date.now() + 6 * 24 * 3600 * 1000);
    expect(doc.expiresAt.getTime()).toBeLessThanOrEqual(Date.now() + 7 * 24 * 3600 * 1000);
    expect(r2.presignGet).toHaveBeenCalledWith('Movies/a.mp4');
  });

  it('start reutiliza registro existente y lo reinicia', async () => {
    const existing: Record<string, unknown> = {
      _id: '507f1f77bcf86cd799439088',
      status: 'completed',
      progressPct: 100,
    };
    existing.set = vi.fn((fields: Record<string, unknown>) => {
      Object.assign(existing, fields);
    });
    existing.save = vi.fn().mockResolvedValue(existing);
    findResult.exec.mockResolvedValue(existing);

    const result = await service.start(userId, { itemType: 'movie', refId });

    expect(result.downloadId).toBe('507f1f77bcf86cd799439088');
    expect(existing.set).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'pending', progressPct: 0 }),
    );
    expect(model.create).not.toHaveBeenCalled();
  });

  it('start propaga 404 si el recurso no existe', async () => {
    library.findVideoForDownload.mockRejectedValue(new NotFoundException());

    await expect(
      service.start(userId, { itemType: 'episode', refId }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(r2.presignGet).not.toHaveBeenCalled();
  });

  it('updateProgress cambia pct y marca downloading', async () => {
    const doc = {
      progressPct: 0,
      status: 'pending',
      save: vi.fn(),
    };
    doc.save.mockResolvedValue(doc);
    findResult.exec.mockResolvedValue(doc);

    const result = await service.updateProgress(userId, refId, 42);

    expect(doc.progressPct).toBe(42);
    expect(doc.status).toBe('downloading');
    expect(result).toBe(doc);
  });

  it('updateProgress no reabre una descarga completada', async () => {
    const doc = {
      progressPct: 100,
      status: 'completed',
      save: vi.fn(),
    };
    doc.save.mockResolvedValue(doc);
    findResult.exec.mockResolvedValue(doc);

    await service.updateProgress(userId, refId, 10);

    expect(doc.status).toBe('completed');
  });

  it('updateProgress lanza 404 si no existe', async () => {
    findResult.exec.mockResolvedValue(null);

    await expect(service.updateProgress(userId, 'x', 10)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('complete marca completed con pct 100 y fileSize', async () => {
    const doc = {
      status: 'pending',
      progressPct: 90,
      fileSize: undefined,
      save: vi.fn(),
    };
    doc.save.mockResolvedValue(doc);
    findResult.exec.mockResolvedValue(doc);

    const result = await service.complete(userId, refId, 555);

    expect(doc.status).toBe('completed');
    expect(doc.progressPct).toBe(100);
    expect(doc.fileSize).toBe(555);
    expect(result).toBe(doc);
  });

  it('remove devuelve deleted true si borra', async () => {
    model.deleteOne.mockResolvedValue({ deletedCount: 1 });

    const result = await service.remove(userId, refId);

    expect(result).toEqual({ deleted: true });
    expect(model.deleteOne).toHaveBeenCalledWith({
      _id: expect.any(Object),
      userId: expect.any(Object),
    });
  });

  it('remove devuelve deleted false con id inválido', async () => {
    const result = await service.remove(userId, 'nope');

    expect(result).toEqual({ deleted: false });
    expect(model.deleteOne).not.toHaveBeenCalled();
  });

  it('purgeExpired borra registros vencidos', async () => {
    model.deleteMany.mockResolvedValue({ deletedCount: 3 });

    const result = await service.purgeExpired();

    expect(result).toBe(3);
    expect(model.deleteMany).toHaveBeenCalledWith({
      expiresAt: { $lt: expect.any(Date) },
    });
  });
});
