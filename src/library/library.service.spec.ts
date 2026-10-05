import { NotFoundException } from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import { Test, TestingModule } from '@nestjs/testing';
import { Types } from 'mongoose';
import { LibraryService } from './library.service.js';
import { Episode } from './schemas/episode.schema.js';
import { LibraryItem } from './schemas/library-item.schema.js';
import { Season } from './schemas/season.schema.js';
import { Series } from './schemas/series.schema.js';

describe('LibraryService', () => {
  let service: LibraryService;

  const libraryItems = {
    find: vi.fn(),
    countDocuments: vi.fn(),
    findOne: vi.fn(),
    exists: vi.fn(),
  };
  const series = { findOne: vi.fn() };
  const seasons = { find: vi.fn() };
  const episodes = { find: vi.fn(), findOne: vi.fn(), exists: vi.fn() };

  const userId = '507f1f77bcf86cd799439011';

  function chain(result: unknown) {
    const exec = vi.fn().mockResolvedValue(result);
    const limit = vi.fn().mockReturnValue({ exec });
    const skip = vi.fn().mockReturnValue({ limit });
    const sort = vi.fn().mockReturnValue({ skip });
    const find = vi.fn().mockReturnValue({ sort });
    return { find, sort, skip, limit, exec };
  }

  beforeEach(async () => {
    vi.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LibraryService,
        { provide: getModelToken(LibraryItem.name), useValue: libraryItems },
        { provide: getModelToken(Series.name), useValue: series },
        { provide: getModelToken(Season.name), useValue: seasons },
        { provide: getModelToken(Episode.name), useValue: episodes },
      ],
    }).compile();

    service = module.get<LibraryService>(LibraryService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('list pagina y filtra por userId', async () => {
    const items = [{ title: 'Inception' }];
    const c = chain(items);
    libraryItems.find.mockImplementation(() => ({
      sort: c.sort,
    }));
    c.sort.mockReturnValue({ skip: c.skip });
    c.skip.mockReturnValue({ limit: c.limit });
    c.limit.mockReturnValue({ exec: c.exec });
    libraryItems.countDocuments.mockResolvedValue(1);

    const result = await service.list(userId, {
      page: 2,
      limit: 10,
      type: 'movie',
      q: 'inc',
    });

    expect(result).toEqual({
      items,
      total: 1,
      page: 2,
      limit: 10,
    });
    expect(libraryItems.find).toHaveBeenCalledWith({
      userId: expect.any(Types.ObjectId),
      type: 'movie',
      title: { $regex: 'inc', $options: 'i' },
    });
    expect(c.skip).toHaveBeenCalledWith(10);
    expect(c.limit).toHaveBeenCalledWith(10);
  });

  it('getItem devuelve item propio', async () => {
    const itemId = new Types.ObjectId().toString();
    libraryItems.findOne.mockReturnValue({
      exec: vi.fn().mockResolvedValue({ _id: itemId, title: 'Película' }),
    });

    const result = await service.getItem(userId, itemId);

    expect(result).toEqual({ _id: itemId, title: 'Película' });
    expect(libraryItems.findOne).toHaveBeenCalledWith({
      _id: itemId,
      userId: expect.any(Types.ObjectId),
    });
  });

  it('getItem lanza 404 si no existe', async () => {
    libraryItems.findOne.mockReturnValue({
      exec: vi.fn().mockResolvedValue(null),
    });

    await expect(
      service.getItem(userId, new Types.ObjectId().toString()),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('seriesDetail agrupa episodios por temporada', async () => {
    const seriesId = new Types.ObjectId().toString();
    const seasonId = new Types.ObjectId();
    series.findOne.mockReturnValue({
      exec: vi.fn().mockResolvedValue({ _id: seriesId, title: 'Show' }),
    });
    seasons.find.mockReturnValue({
      sort: vi.fn().mockReturnValue({
        exec: vi.fn().mockResolvedValue([{ _id: seasonId, number: 1 }]),
      }),
    });
    episodes.find.mockReturnValue({
      sort: vi.fn().mockReturnValue({
        exec: vi
          .fn()
          .mockResolvedValue([
            { _id: 'e1', seasonId, number: 1 },
            { _id: 'e2', seasonId, number: 2 },
          ]),
      }),
    });

    const result = await service.seriesDetail(userId, seriesId);

    expect(result.series).toEqual({ _id: seriesId, title: 'Show' });
    expect(result.seasons).toHaveLength(1);
    expect(result.seasons[0].season).toBe(1);
    expect(result.seasons[0].episodes).toHaveLength(2);
  });

  it('seriesDetail lanza 404 con id inválido', async () => {
    await expect(service.seriesDetail(userId, 'no-id')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('findOwnedKey comprueba items y episodios', async () => {
    libraryItems.exists.mockResolvedValue(null);
    episodes.exists.mockResolvedValue({ _id: 'x' });

    await expect(
      service.findOwnedKey(userId, 'Movies/a.mp4'),
    ).resolves.toBe(true);
    expect(episodes.exists).toHaveBeenCalledWith({
      userId: expect.any(Types.ObjectId),
      r2Key: 'Movies/a.mp4',
    });
  });

  it('findVideoForDownload devuelve datos de película', async () => {
    libraryItems.findOne.mockReturnValue({
      exec: vi.fn().mockResolvedValue({
        _id: 'x',
        r2Key: 'Movies/a.mp4',
        title: 'Película',
        fileSize: 42,
      }),
    });

    const result = await service.findVideoForDownload(
      userId,
      'movie',
      new Types.ObjectId().toString(),
    );

    expect(result).toEqual({
      r2Key: 'Movies/a.mp4',
      fileName: 'Película.mp4',
      fileSize: 42,
    });
  });
});
