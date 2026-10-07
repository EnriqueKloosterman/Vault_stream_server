import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { TmdbApiError, TmdbService } from './tmdb.service.js';

describe('TmdbService', () => {
  let service: TmdbService;
  let fetchMock: ReturnType<typeof vi.fn>;

  const config = {
    getOrThrow: vi.fn((key: string) => {
      if (key === 'TMDB_API_KEY') {
        return 'api-key-123';
      }
      throw new Error(`missing ${key}`);
    }),
    get: vi.fn(),
  };

  function jsonResponse(results: unknown): unknown {
    return {
      ok: true,
      json: async () => ({ results }),
    };
  }

  beforeEach(async () => {
    vi.clearAllMocks();
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const module = await Test.createTestingModule({
      providers: [TmdbService, { provide: ConfigService, useValue: config }],
    }).compile();

    service = module.get<TmdbService>(TmdbService);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('search consulta es-ES y en-US y fusiona por id con aliases', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('language=en-US')) {
        return jsonResponse([
          {
            id: 1,
            title: 'He-Man and the Masters of the Universe',
            original_title: 'He-Man and the Masters of the Universe',
            release_date: '1983-09-05',
            poster_path: '/poster.jpg',
            overview: 'Spear of power.',
            original_language: 'en',
            vote_count: 500,
          },
        ]);
      }
      return jsonResponse([
        {
          id: 1,
          title: 'He-Man y los Amos del Universo',
          original_title: 'He-Man and the Masters of the Universe',
          release_date: '1983-09-05',
          poster_path: '/poster.jpg',
          overview: 'La lanza del poder.',
          original_language: 'en',
          vote_count: 500,
        },
      ]);
    });

    const results = await service.search({ query: 'He-Man', type: 'series', year: 1983 });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const urls = fetchMock.mock.calls.map((call) => call[0] as string);
    expect(urls[0]).toContain('/3/search/tv?');
    expect(urls[0]).toContain('api_key=api-key-123');
    expect(urls[0]).toContain('language=es-ES');
    expect(urls[0]).toContain('first_air_date_year=1983');
    expect(urls[1]).toContain('language=en-US');

    expect(results).toHaveLength(1);
    expect(results[0].aliases).toEqual(
      expect.arrayContaining([
        'He-Man y los Amos del Universo',
        'He-Man and the Masters of the Universe',
      ]),
    );
    expect(results[0].name).toBe('He-Man y los Amos del Universo');
    expect(results[0].overview).toBe('La lanza del poder.');
    expect(results[0].posterPath).toBe('/poster.jpg');
  });

  it('search de películas usa year y rellena el hueco de poster de un idioma', async () => {
    fetchMock.mockImplementation(async (url: string) =>
      url.includes('language=en-US')
        ? jsonResponse([
            { id: 7, title: 'Inception', release_date: '2010-07-16', poster_path: '/p.jpg' },
          ])
        : jsonResponse([
            { id: 7, title: 'Inception', release_date: '2010-07-16', poster_path: null },
          ]),
    );

    const results = await service.search({ query: 'Inception', type: 'movie', year: 2010 });

    const esUrl = fetchMock.mock.calls[0][0] as string;
    expect(esUrl).toContain('/3/search/movie?');
    expect(esUrl).toContain('year=2010');
    expect(results[0].posterPath).toBe('/p.jpg');
  });

  it('season devuelve episodios con numero y still', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        episodes: [
          { episode_number: 1, still_path: '/still1.jpg' },
          { episode_number: 2, still_path: null },
        ],
      }),
    });

    const result = await service.season(931, 1);

    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).toContain('/tv/931/season/1?');
    expect(url).toContain('api_key=api-key-123');
    expect(result.episodes).toEqual([
      { episodeNumber: 1, stillPath: '/still1.jpg' },
      { episodeNumber: 2, stillPath: undefined },
    ]);
  });

  it('lanza TmdbApiError si la respuesta no es ok', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 401 });

    await expect(
      service.search({ query: 'x', type: 'movie' }),
    ).rejects.toBeInstanceOf(TmdbApiError);
  });

  it('lanza TmdbApiError si fetch falla', async () => {
    fetchMock.mockRejectedValue(new Error('network down'));

    await expect(
      service.search({ query: 'x', type: 'movie' }),
    ).rejects.toBeInstanceOf(TmdbApiError);
  });

  it('construye URLs de imagen', () => {
    expect(service.posterUrl('/abc.jpg')).toBe('https://image.tmdb.org/t/p/w500/abc.jpg');
    expect(service.backdropUrl('/abc.jpg')).toBe(
      'https://image.tmdb.org/t/p/w1280/abc.jpg',
    );
    expect(service.stillUrl('/abc.jpg')).toBe('https://image.tmdb.org/t/p/w300/abc.jpg');
    expect(service.posterUrl(undefined)).toBeUndefined();
    expect(service.backdropUrl(undefined)).toBeUndefined();
    expect(service.stillUrl(undefined)).toBeUndefined();
  });
});