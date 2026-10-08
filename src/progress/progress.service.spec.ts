import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { ProgressService } from './progress.service.js';
import { WatchProgress } from './schemas/watch-progress.schema.js';

describe('ProgressService', () => {
  let service: ProgressService;

  const findResult = {
    exec: vi.fn(),
    sort: vi.fn(),
    limit: vi.fn(),
  };
  findResult.sort.mockReturnValue(findResult);
  findResult.limit.mockReturnValue(findResult);

  const model = {
    find: vi.fn(),
    bulkWrite: vi.fn(),
  };
  model.find.mockReturnValue(findResult);

  const userId = '507f1f77bcf86cd799439011';
  const refId = '507f1f77bcf86cd799439012';

  const singleUpdate = {
    itemType: 'movie' as const,
    refId,
    currentTimeSec: 120,
    durationSec: 600,
    completedPct: 20,
    lastUpdated: 1000,
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    findResult.exec.mockResolvedValue([]);
    model.bulkWrite.mockResolvedValue({});

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProgressService,
        { provide: getModelToken(WatchProgress.name), useValue: model },
      ],
    }).compile();

    service = module.get<ProgressService>(ProgressService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('list filtra por usuario y ordena por lastUpdated', async () => {
    findResult.exec.mockResolvedValue([{ lastUpdated: 5 }]);

    const result = await service.list(userId);

    expect(result).toEqual([{ lastUpdated: 5 }]);
    expect(model.find).toHaveBeenCalledWith({
      userId: expect.any(Object),
    });
    expect(findResult.sort).toHaveBeenCalledWith({ lastUpdated: -1 });
  });

  it('list acepta filtro itemType y refId', async () => {
    await service.list(userId, 'episode', refId);

    expect(model.find).toHaveBeenCalledWith({
      userId: expect.any(Object),
      itemType: 'episode',
      refId: expect.any(Object),
    });
  });

  it('apply upsert cuando no existe progreso', async () => {
    const result = await service.apply(userId, { updates: [singleUpdate] });

    expect(result).toEqual({ updated: 1, skipped: 0 });
    expect(model.bulkWrite).toHaveBeenCalledTimes(1);
    const operations = model.bulkWrite.mock.calls[0][0];
    expect(operations).toHaveLength(1);
    expect(operations[0].updateOne.upsert).toBe(true);
    expect(operations[0].updateOne.update.$set).toMatchObject({
      currentTimeSec: 120,
      lastUpdated: 1000,
    });
  });

  it('LWW aplica cuando lastUpdated es mayor', async () => {
    findResult.exec.mockResolvedValue([
      { itemType: 'movie', refId, lastUpdated: 500 },
    ]);

    const result = await service.apply(userId, { updates: [singleUpdate] });

    expect(result).toEqual({ updated: 1, skipped: 0 });
    expect(model.bulkWrite).toHaveBeenCalledTimes(1);
  });

  it('LWW salta cuando lastUpdated es menor o igual', async () => {
    findResult.exec.mockResolvedValue([
      { itemType: 'movie', refId, lastUpdated: 1000 },
    ]);

    const result = await service.apply(userId, {
      updates: [{ ...singleUpdate, lastUpdated: 999 }],
    });

    expect(result).toEqual({ updated: 0, skipped: 1 });
    expect(model.bulkWrite).not.toHaveBeenCalled();
  });

  it('batch mezcla actualizados y descartados', async () => {
    findResult.exec.mockResolvedValue([
      { itemType: 'movie', refId, lastUpdated: 1000 },
    ]);
    const otherRef = '507f1f77bcf86cd799439013';

    const result = await service.apply(userId, {
      updates: [
        { ...singleUpdate, lastUpdated: 500 },
        { ...singleUpdate, refId: otherRef },
      ],
    });

    expect(result).toEqual({ updated: 1, skipped: 1 });
  });

  it('batch con claves duplicadas usa el primero como base', async () => {
    const result = await service.apply(userId, {
      updates: [
        { ...singleUpdate, lastUpdated: 2000 },
        { ...singleUpdate, lastUpdated: 1000 },
      ],
    });

    expect(result).toEqual({ updated: 1, skipped: 1 });
  });

  it('acepta progreso único en cuerpo plano', async () => {
    const result = await service.apply(userId, singleUpdate);

    expect(result).toEqual({ updated: 1, skipped: 0 });
  });

  it('rechaza updates vacío', async () => {
    await expect(service.apply(userId, { updates: [] })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('rechaza progreso único incompleto', async () => {
    await expect(
      service.apply(userId, { itemType: 'movie', refId }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
