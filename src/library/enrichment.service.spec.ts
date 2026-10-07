import { getModelToken } from '@nestjs/mongoose';
import { Test } from '@nestjs/testing';
import { TmdbService } from '../infra/tmdb/tmdb.service.js';
import type { TmdbCandidate } from '../infra/tmdb/tmdb-matching.js';
import { EnrichmentService } from './enrichment.service.js';
import { Episode } from './schemas/episode.schema.js';
import { LibraryItem } from './schemas/library-item.schema.js';
import { Season } from './schemas/season.schema.js';
import { Series } from './schemas/series.schema.js';

describe('EnrichmentService', () => {
  let service: EnrichmentService;

  const tmdb = {
    search: vi.fn(),
    season: vi.fn(),
    posterUrl: vi.fn((path?: string) =>
      path ? `https://image.tmdb.org/t/p/w500${path}` : undefined,
    ),
    backdropUrl: vi.fn((path?: string) =>
      path ? `https://image.tmdb.org/t/p/w1280${path}` : undefined,
    ),
    stillUrl: vi.fn((path?: string) =>
      path ? `https://image.tmdb.org/t/p/w300${path}` : undefined,
    ),
  };
  const libraryItems = { find: vi.fn(), updateOne: vi.fn() };
  const series = { updateOne: vi.fn() };
  const seasons = { find: vi.fn() };
  const episodes = { updateOne: vi.fn() };

  const userId = '507f1f77bcf86cd799439011';

  function chainFind(result: unknown) {
    const exec = vi.fn().mockResolvedValue(result);
    const select = vi.fn().mockReturnValue({ exec });
    const limit = vi.fn().mockReturnValue({ select });
    const find = vi.fn().mockReturnValue({ limit });
    libraryItems.find.mockReturnValue(find());
    return find;
  }

  function chainSeasonFind(result: unknown) {
    const exec = vi.fn().mockResolvedValue(result);
    const find = vi.fn().mockReturnValue({ exec });
    seasons.find.mockReturnValue(find());
    return find;
  }

  function movieCandidate(overrides: Partial<TmdbCandidate> = {}): TmdbCandidate {
    return {
      id: 1,
      name: 'Inception',
      aliases: ['Inception'],
      releaseDate: '2010-07-16',
      posterPath: '/poster.jpg',
      backdropPath: '/backdrop.jpg',
      overview: 'Un ladrón entra en sueños.',
      language: 'en',
      voteCount: 30000,
      ...overrides,
    };
  }

  beforeEach(async () => {
    vi.clearAllMocks();
    chainSeasonFind([]);
    const module = await Test.createTestingModule({
      providers: [
        EnrichmentService,
        { provide: TmdbService, useValue: tmdb },
        { provide: getModelToken(LibraryItem.name), useValue: libraryItems },
        { provide: getModelToken(Series.name), useValue: series },
        { provide: getModelToken(Season.name), useValue: seasons },
        { provide: getModelToken(Episode.name), useValue: episodes },
      ],
    }).compile();

    service = module.get<EnrichmentService>(EnrichmentService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('enriquece una película y persiste poster/backdrop', async () => {
    chainFind([{ _id: 'i1', type: 'movie', title: 'Inception', year: 2010 }]);
    tmdb.search.mockResolvedValue([movieCandidate()]);

    const result = await service.enrichUserLibrary(userId);

    expect(tmdb.search).toHaveBeenCalledWith({
      query: 'Inception',
      type: 'movie',
      year: 2010,
    });
    expect(libraryItems.updateOne).toHaveBeenCalledWith(
      { _id: 'i1' },
      {
        $set: {
          posterUrl: 'https://image.tmdb.org/t/p/w500/poster.jpg',
          backdropUrl: 'https://image.tmdb.org/t/p/w1280/backdrop.jpg',
          tmdbId: 1,
        },
        $unset: { tmdbSkipped: 1 },
      },
    );
    expect(series.updateOne).not.toHaveBeenCalled();
    expect(result).toEqual({ processed: 1, matched: 1 });
  });

  it('para series además sincroniza el doc Series con synopsis', async () => {
    chainFind([
      { _id: 's1', type: 'series', title: 'Breaking Bad', year: 2008 },
    ]);
    tmdb.search.mockResolvedValue([
      movieCandidate({
        id: 2,
        name: 'Breaking Bad',
        aliases: ['Breaking Bad'],
        releaseDate: '2008-01-20',
        overview: 'Un profesor de química cocina meta.',
      }),
    ]);

    await service.enrichUserLibrary(userId);

    expect(tmdb.search).toHaveBeenCalledWith({
      query: 'Breaking Bad',
      type: 'series',
      year: 2008,
    });
    expect(libraryItems.updateOne).toHaveBeenCalledWith(
      { _id: 's1' },
      {
        $set: {
          posterUrl: 'https://image.tmdb.org/t/p/w500/poster.jpg',
          backdropUrl: 'https://image.tmdb.org/t/p/w1280/backdrop.jpg',
          tmdbId: 2,
        },
        $unset: { tmdbSkipped: 1 },
      },
    );
    expect(series.updateOne).toHaveBeenCalledWith(
      { userId: expect.anything(), title: 'Breaking Bad' },
      {
        $set: {
          posterUrl: 'https://image.tmdb.org/t/p/w500/poster.jpg',
          backdropUrl: 'https://image.tmdb.org/t/p/w1280/backdrop.jpg',
          tmdbId: 2,
          synopsis: 'Un profesor de química cocina meta.',
        },
      },
    );
  });

  it('asigna stills a los episodios de una serie', async () => {
    chainFind([
      {
        _id: 's2',
        type: 'series',
        title: 'He-Man and the Masters of the Universe',
        seriesId: 'ser-1',
      },
    ]);
    tmdb.search.mockResolvedValue([
      movieCandidate({
        id: 931,
        name: 'He-Man y los Amos del Universo',
        aliases: ['He-Man and the Masters of the Universe'],
        releaseDate: '1983-09-05',
      }),
    ]);
    chainSeasonFind([{ _id: 'season-1', number: 1 }]);
    tmdb.season.mockResolvedValue({
      episodes: [
        { episodeNumber: 1, stillPath: '/still1.jpg' },
        { episodeNumber: 2, stillPath: undefined },
      ],
    });

    await service.enrichUserLibrary(userId);

    expect(episodes.updateOne).toHaveBeenCalledWith(
      {
        userId: expect.anything(),
        seriesId: 'ser-1',
        seasonId: 'season-1',
        number: 1,
      },
      { $set: { stillUrl: 'https://image.tmdb.org/t/p/w300/still1.jpg' } },
    );
    expect(episodes.updateOne).toHaveBeenCalledTimes(1);
  });

  it('marca como skip si no hay coincidencia y no persiste URLs', async () => {
    chainFind([{ _id: 'i2', type: 'movie', title: 'Raro 1234', year: 2020 }]);
    tmdb.search.mockResolvedValue([
      movieCandidate({ id: 3, name: 'Otra cosa', releaseDate: '2020-02-02' }),
    ]);

    const result = await service.enrichUserLibrary(userId);

    expect(libraryItems.updateOne).toHaveBeenCalledWith(
      { _id: 'i2' },
      { $set: { tmdbSkipped: true } },
    );
    expect(result).toEqual({ processed: 1, matched: 0 });
  });

  it('no marca skip si TMDB falla, pero sigue con el resto', async () => {
    chainFind([
      { _id: 'bad', type: 'movie', title: 'Caos', year: 2010 },
      { _id: 'ok', type: 'movie', title: 'Inception', year: 2010 },
    ]);
    tmdb.search
      .mockRejectedValueOnce(new Error('timeout'))
      .mockResolvedValueOnce([movieCandidate()]);

    const result = await service.enrichUserLibrary(userId);

    expect(libraryItems.updateOne).toHaveBeenCalledTimes(1);
    expect(libraryItems.updateOne).toHaveBeenCalledWith(
      { _id: 'ok' },
      expect.anything(),
    );
    expect(result).toEqual({ processed: 2, matched: 1 });
  });

  it('filtra por userId y solo lo que aún no tiene póster ni está marcado', async () => {
    chainFind([]);
    await service.enrichUserLibrary(userId);

    expect(libraryItems.find.mock.calls[0][0]).toEqual({
      userId: expect.anything(),
      posterUrl: { $exists: false },
      tmdbSkipped: { $ne: true },
    });
  });
});