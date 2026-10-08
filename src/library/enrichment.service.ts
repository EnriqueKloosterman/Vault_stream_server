import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { TmdbService } from '../infra/tmdb/tmdb.service.js';
import { findBestMatch, type TmdbMatch } from '../infra/tmdb/tmdb-matching.js';
import { Episode } from './schemas/episode.schema.js';
import { LibraryItem } from './schemas/library-item.schema.js';
import { Season } from './schemas/season.schema.js';
import { Series } from './schemas/series.schema.js';

const ENRICH_BATCH_SIZE = 25;
const MAX_CONSECUTIVE_FAILURES = 5;
const SYNOPSIS_MAX_LENGTH = 2000;

export interface EnrichmentResult {
  processed: number;
  matched: number;
}

interface EnrichableItem {
  _id: Types.ObjectId;
  type: 'movie' | 'series';
  title: string;
  seriesId?: Types.ObjectId;
}

@Injectable()
export class EnrichmentService {
  private readonly logger = new Logger(EnrichmentService.name);

  constructor(
    private readonly tmdb: TmdbService,
    @InjectModel(LibraryItem.name)
    private readonly libraryItems: Model<LibraryItem>,
    @InjectModel(Series.name) private readonly series: Model<Series>,
    @InjectModel(Season.name) private readonly seasons: Model<Season>,
    @InjectModel(Episode.name) private readonly episodes: Model<Episode>,
  ) {}

  async enrichUserLibrary(userId: string): Promise<EnrichmentResult> {
    const userObj = new Types.ObjectId(userId);
    const items = await this.libraryItems
      .find({
        userId: userObj,
        posterUrl: { $exists: false },
        tmdbSkipped: { $ne: true },
      })
      .limit(ENRICH_BATCH_SIZE)
      .select('_id type title year seriesId')
      .exec();

    let matched = 0;
    let consecutiveFailures = 0;
    for (const item of items) {
      let match: TmdbMatch | null;
      try {
        const candidates = await this.tmdb.search({
          query: item.title,
          type: item.type,
          year: item.year,
        });
        match = findBestMatch(candidates, { title: item.title, year: item.year });
      } catch (error) {
        consecutiveFailures += 1;
        this.logger.debug(
          `TMDB falló para "${item.title}" (${String(error)}); ` +
            `fallo consecutivo #${consecutiveFailures}`,
        );
        if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
          this.logger.warn(
            `TMDB inestable: se detiene el enriquecimiento de ${userId} tras ` +
              `${consecutiveFailures} fallos consecutivos`,
          );
          break;
        }
        continue;
      }
      consecutiveFailures = 0;

      if (!match) {
        try {
          await this.libraryItems.updateOne(
            { _id: item._id },
            { $set: { tmdbSkipped: true } },
          );
        } catch (error) {
          this.logger.warn(
            `No se pudo marcar tmdbSkipped para ${String(item._id)}: ${String(error)}`,
          );
        }
        continue;
      }

      try {
        await this.persistMatch(userObj, item, match);
        matched += 1;
      } catch (error) {
        this.logger.warn(
          `persistMatch falló para "${item.title}": ${String(error)}`,
        );
      }
    }

    return { processed: items.length, matched };
  }

  private async persistMatch(
    userObj: Types.ObjectId,
    item: EnrichableItem,
    match: TmdbMatch,
  ): Promise<void> {
    const posterUrl = this.tmdb.posterUrl(match.candidate.posterPath);
    const backdropUrl = this.tmdb.backdropUrl(match.candidate.backdropPath);
    const synopsis = match.candidate.overview?.slice(0, SYNOPSIS_MAX_LENGTH);

    if (!posterUrl && !backdropUrl && !synopsis) {
      await this.libraryItems.updateOne(
        { _id: item._id },
        { $set: { tmdbSkipped: true, tmdbId: match.candidate.id } },
      );
      return;
    }

    const setFields: Record<string, unknown> = {
      tmdbId: match.candidate.id,
    };
    if (posterUrl) {
      setFields.posterUrl = posterUrl;
    }
    if (backdropUrl) {
      setFields.backdropUrl = backdropUrl;
    }
    await this.libraryItems.updateOne(
      { _id: item._id },
      {
        $set: setFields,
        $unset: { tmdbSkipped: 1 },
      },
    );

    if (item.type === 'series' && item.seriesId) {
      const seriesSet: Record<string, unknown> = {
        tmdbId: match.candidate.id,
      };
      if (posterUrl) {
        seriesSet.posterUrl = posterUrl;
      }
      if (backdropUrl) {
        seriesSet.backdropUrl = backdropUrl;
      }
      if (synopsis) {
        seriesSet.synopsis = synopsis;
      }
      await this.series.updateOne(
        { _id: item.seriesId, userId: userObj },
        { $set: seriesSet },
      );
      await this.enrichEpisodeStills(
        userObj,
        item.seriesId,
        match.candidate.id,
      );
    }
  }

  private async enrichEpisodeStills(
    userObj: Types.ObjectId,
    seriesId: Types.ObjectId,
    tmdbSeriesId: number,
  ): Promise<void> {
    try {
      const seasons = await this.seasons
        .find({ userId: userObj, seriesId })
        .exec();
      for (const season of seasons) {
        let detail;
        try {
          detail = await this.tmdb.season(tmdbSeriesId, season.number);
        } catch (error) {
          // Una temporada inexistente (p. ej. Specials/0) no debe
          // impedir el resto.
          this.logger.debug(
            `TMDB season ${tmdbSeriesId}/${season.number} falló: ${String(error)}`,
          );
          continue;
        }
        const operations = [];
        for (const episode of detail.episodes) {
          const stillUrl = this.tmdb.stillUrl(episode.stillPath);
          if (!stillUrl) {
            continue;
          }
          operations.push({
            updateOne: {
              filter: {
                userId: userObj,
                seriesId,
                seasonId: season._id,
                number: episode.episodeNumber,
              },
              update: { $set: { stillUrl } },
            },
          });
        }
        if (operations.length > 0) {
          try {
            await this.episodes.bulkWrite(operations);
          } catch (error) {
            this.logger.debug(
              `bulkWrite de stills falló para ${String(seriesId)}: ${String(error)}`,
            );
          }
        }
      }
    } catch (error) {
      this.logger.debug(
        `Fallo el enriquecimiento de stills de la serie ${String(
          tmdbSeriesId,
        )}: ${String(error)}`,
      );
    }
  }
}