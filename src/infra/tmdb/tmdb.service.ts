import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { TmdbCandidate } from './tmdb-matching.js';

const TMDB_API = 'https://api.themoviedb.org/3';
const TMDB_IMAGE = 'https://image.tmdb.org/t/p';
const REQUEST_TIMEOUT_MS = 8000;

/**
 * La biblioteca mezcla títulos en español e inglés (los nombres de archivo R2).
 * Se consulta TMDB en ambos idiomas y se fusionan los resultados por id.
 */
const SEARCH_LANGUAGES = ['es-ES', 'en-US'] as const;

export class TmdbApiError extends Error {}

interface TmdbResultRecord {
  id: number;
  title?: string;
  name?: string;
  original_title?: string;
  original_name?: string;
  release_date?: string;
  first_air_date?: string;
  poster_path?: string | null;
  backdrop_path?: string | null;
  overview?: string;
  original_language?: string;
  vote_count?: number;
}

export interface TmdbSearchOptions {
  query: string;
  type: 'movie' | 'series';
  year?: number;
}

export interface TmdbSeasonEpisode {
  episodeNumber: number;
  stillPath?: string;
}

export interface TmdbSeasonResult {
  episodes: TmdbSeasonEpisode[];
}

@Injectable()
export class TmdbService {
  private readonly apiKey: string;

  constructor(config: ConfigService) {
    this.apiKey = config.getOrThrow<string>('TMDB_API_KEY');
  }

  async search(options: TmdbSearchOptions): Promise<TmdbCandidate[]> {
    const endpoint = options.type === 'movie' ? 'search/movie' : 'search/tv';
    const yearParam =
      options.type === 'movie' ? 'year' : 'first_air_date_year';

    const settled = await Promise.allSettled(
      SEARCH_LANGUAGES.map(async (language) => {
        const params = new URLSearchParams({
          api_key: this.apiKey,
          query: options.query,
          language,
        });
        if (options.year !== undefined) {
          params.set(yearParam, String(options.year));
        }
        const body = await this.requestJson<{ results?: TmdbResultRecord[] }>(
          `${TMDB_API}/${endpoint}?${params}`,
        );
        return (body.results ?? []).map((record) => toCandidate(record));
      }),
    );
    const grouped = settled.flatMap((entry) =>
      entry.status === 'fulfilled' ? [entry.value] : [],
    );
    if (grouped.length === 0) {
      throw new TmdbApiError('TMDB no respondió en ningún idioma');
    }

    const merged = new Map<number, TmdbCandidate>();
    for (const candidates of grouped) {
      for (const candidate of candidates) {
        const existing = merged.get(candidate.id);
        if (!existing) {
          merged.set(candidate.id, candidate);
          continue;
        }
        const seen = new Set(existing.aliases);
        for (const alias of candidate.aliases) {
          if (!seen.has(alias)) {
            existing.aliases.push(alias);
            seen.add(alias);
          }
        }
        if (!existing.posterPath && candidate.posterPath) {
          existing.posterPath = candidate.posterPath;
        }
        if (!existing.backdropPath && candidate.backdropPath) {
          existing.backdropPath = candidate.backdropPath;
        }
        if (!existing.overview && candidate.overview) {
          existing.overview = candidate.overview;
        }
        if (!existing.releaseDate && candidate.releaseDate) {
          existing.releaseDate = candidate.releaseDate;
        }
        if (existing.voteCount === 0 && candidate.voteCount > 0) {
          existing.voteCount = candidate.voteCount;
        }
      }
    }
    return [...merged.values()];
  }

  async season(
    seriesId: number,
    seasonNumber: number,
  ): Promise<TmdbSeasonResult> {
    const params = new URLSearchParams({
      api_key: this.apiKey,
      language: 'es-ES',
    });
    const body = await this.requestJson<{
      episodes?: Array<{
        episode_number?: number;
        still_path?: string | null;
      }>;
    }>(`${TMDB_API}/tv/${seriesId}/season/${seasonNumber}?${params}`);

    return {
      episodes: (body.episodes ?? [])
        .map((episode) => ({
          episodeNumber: episode.episode_number ?? 0,
          stillPath: episode.still_path ?? undefined,
        }))
        .filter((episode) => episode.episodeNumber > 0),
    };
  }

  posterUrl(path: string | undefined): string | undefined {
    return path ? `${TMDB_IMAGE}/w500${path}` : undefined;
  }

  backdropUrl(path: string | undefined): string | undefined {
    return path ? `${TMDB_IMAGE}/w1280${path}` : undefined;
  }

  stillUrl(path: string | undefined): string | undefined {
    return path ? `${TMDB_IMAGE}/w300${path}` : undefined;
  }

  private async requestJson<T>(url: string): Promise<T> {
    let response: Response;
    try {
      response = await fetch(url, {
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (error) {
      throw new TmdbApiError(`TMDB no respondió: ${String(error)}`);
    }
    if (!response.ok) {
      throw new TmdbApiError(`TMDB responded ${response.status}`);
    }
    try {
      return (await response.json()) as T;
    } catch {
      throw new TmdbApiError('TMDB devolvió una respuesta no-JSON');
    }
  }
}

function toCandidate(record: TmdbResultRecord): TmdbCandidate {
  const localized = record.title ?? record.name;
  const original = record.original_title ?? record.original_name;
  return {
    id: record.id,
    name: localized ?? '',
    aliases: uniqueAliases([localized, original]),
    releaseDate: record.release_date ?? record.first_air_date,
    posterPath: record.poster_path ?? undefined,
    backdropPath: record.backdrop_path ?? undefined,
    overview: record.overview,
    language: record.original_language,
    voteCount: record.vote_count ?? 0,
  };
}

function uniqueAliases(names: Array<string | undefined>): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const name of names) {
    const clean = name?.trim();
    if (clean && !seen.has(clean)) {
      seen.add(clean);
      result.push(clean);
    }
  }
  return result;
}