import { ConfigService } from '@nestjs/config';
import { getModelToken } from '@nestjs/mongoose';
import { Test, TestingModule } from '@nestjs/testing';
import { R2Service } from '../infra/r2/r2.service.js';
import { ScannerService } from './scanner.service.js';
import { Episode } from './schemas/episode.schema.js';
import { LibraryItem } from './schemas/library-item.schema.js';
import { Season } from './schemas/season.schema.js';
import { Series } from './schemas/series.schema.js';

describe('ScannerService', () => {
  let service: ScannerService;

  const r2 = { listAll: vi.fn(), prefixes: ['Movies'] };
  const config = { get: vi.fn() };
  const libraryItems = { findOneAndUpdate: vi.fn() };
  const series = { findOneAndUpdate: vi.fn() };
  const seasons = { findOneAndUpdate: vi.fn() };
  const episodes = { findOneAndUpdate: vi.fn() };

  const userId = '507f1f77bcf86cd799439011';

  beforeEach(async () => {
    vi.clearAllMocks();
    config.get.mockReturnValue('true');
    series.findOneAndUpdate.mockResolvedValue({ _id: 'series-1' });
    seasons.findOneAndUpdate.mockResolvedValue({ _id: 'season-1' });
    episodes.findOneAndUpdate.mockResolvedValue({});
    libraryItems.findOneAndUpdate.mockResolvedValue({});

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ScannerService,
        { provide: R2Service, useValue: r2 },
        { provide: ConfigService, useValue: config },
        { provide: getModelToken(LibraryItem.name), useValue: libraryItems },
        { provide: getModelToken(Series.name), useValue: series },
        { provide: getModelToken(Season.name), useValue: seasons },
        { provide: getModelToken(Episode.name), useValue: episodes },
      ],
    }).compile();

    service = module.get<ScannerService>(ScannerService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('runScan indexa películas, series y episodios', async () => {
    r2.listAll.mockResolvedValue([
      { key: 'Movies/Inception 2010.mp4', size: 1000 },
      { key: 'Movies/Inception 2010.srt', size: 10 },
      {
        key: 'Series/Breaking Bad/Season 1/Breaking.Bad.S01E01.mp4',
        size: 2000,
      },
      {
        key: 'Series/Breaking Bad/Season 1/Breaking.Bad.S01E01.srt',
        size: 20,
      },
      { key: 'Movies/notas.txt', size: 5 },
    ]);

    await service.runScan(userId);

    expect(r2.listAll).toHaveBeenCalledWith('Movies');
    expect(libraryItems.findOneAndUpdate).toHaveBeenCalledTimes(2);
    expect(series.findOneAndUpdate).toHaveBeenCalledTimes(1);
    expect(seasons.findOneAndUpdate).toHaveBeenCalledTimes(1);
    expect(episodes.findOneAndUpdate).toHaveBeenCalledTimes(1);

    const episodeCall = episodes.findOneAndUpdate.mock.calls[0];
    expect(episodeCall[0]).toEqual({
      userId: expect.anything(),
      r2Key: 'Series/Breaking Bad/Season 1/Breaking.Bad.S01E01.mp4',
    });
    expect(
      (episodeCall[1] as { $set: { subtitleKey?: string } }).$set.subtitleKey,
    ).toBe('Series/Breaking Bad/Season 1/Breaking.Bad.S01E01.srt');

    const status = service.getStatus(userId);
    expect(status.scanning).toBe(false);
    expect(status.processed).toBe(2);
    expect(status.total).toBe(2);
    expect(status.lastScanAt).toBeInstanceOf(Date);
  });

  it('scan devuelve started y marca scanning', async () => {
    r2.listAll.mockImplementation(
      () => new Promise(() => undefined),
    );

    const result = await service.scan(userId);

    expect(result).toEqual({ status: 'started' });
    expect(service.getStatus(userId).scanning).toBe(true);
  });

  it('scanAuto no ejecuta si SCAN_AUTO_ON_LOGIN=false', async () => {
    config.get.mockReturnValue('false');

    await service.scanAuto(userId);

    expect(r2.listAll).not.toHaveBeenCalled();
    expect(service.getStatus(userId)).toEqual({
      scanning: false,
      processed: 0,
    });
  });
});
