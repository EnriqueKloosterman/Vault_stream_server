import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, type QueryFilter, Types } from 'mongoose';
import { escapeRegex } from './parser.js';
import { Episode } from './schemas/episode.schema.js';
import { LibraryItem } from './schemas/library-item.schema.js';
import { Season } from './schemas/season.schema.js';
import { Series } from './schemas/series.schema.js';

export interface LibraryListParams {
  page: number;
  limit: number;
  type?: 'movie' | 'series';
  q?: string;
}

@Injectable()
export class LibraryService {
  constructor(
    @InjectModel(LibraryItem.name)
    private readonly libraryItems: Model<LibraryItem>,
    @InjectModel(Series.name) private readonly series: Model<Series>,
    @InjectModel(Season.name) private readonly seasons: Model<Season>,
    @InjectModel(Episode.name) private readonly episodes: Model<Episode>,
  ) {}

  async list(
    userId: string,
    params: LibraryListParams,
  ): Promise<{
    items: LibraryItem[];
    total: number;
    page: number;
    limit: number;
  }> {
    const filter: QueryFilter<LibraryItem> = {
      userId: new Types.ObjectId(userId),
    };
    if (params.type) {
      filter.type = params.type;
    }
    if (params.q && params.q.length > 0) {
      filter.title = { $regex: escapeRegex(params.q), $options: 'i' };
    }

    const [items, total] = await Promise.all([
      this.libraryItems
        .find(filter)
        .sort({ title: 1 })
        .skip((params.page - 1) * params.limit)
        .limit(params.limit)
        .exec(),
      this.libraryItems.countDocuments(filter),
    ]);

    return {
      items,
      total,
      page: params.page,
      limit: params.limit,
    };
  }

  async getItem(userId: string, itemId: string): Promise<LibraryItem> {
    if (!Types.ObjectId.isValid(itemId)) {
      throw new NotFoundException('Recurso no encontrado');
    }
    const item = await this.libraryItems
      .findOne({ _id: itemId, userId: new Types.ObjectId(userId) })
      .exec();
    if (!item) {
      throw new NotFoundException('Recurso no encontrado');
    }
    return item;
  }

  async seriesDetail(
    userId: string,
    seriesId: string,
  ): Promise<{
    series: Series;
    seasons: { season: number; episodes: Episode[] }[];
  }> {
    if (!Types.ObjectId.isValid(seriesId)) {
      throw new NotFoundException('Serie no encontrada');
    }
    const userIdObj = new Types.ObjectId(userId);
    const seriesDoc = await this.series
      .findOne({ _id: seriesId, userId: userIdObj })
      .exec();
    if (!seriesDoc) {
      throw new NotFoundException('Serie no encontrada');
    }

    const [seasons, episodes] = await Promise.all([
      this.seasons
        .find({ userId: userIdObj, seriesId: seriesDoc._id })
        .sort({ number: 1 })
        .exec(),
      this.episodes
        .find({ userId: userIdObj, seriesId: seriesDoc._id })
        .sort({ number: 1 })
        .exec(),
    ]);

    return {
      series: seriesDoc,
      seasons: seasons.map((season) => ({
        season: season.number,
        episodes: episodes.filter(
          (episode) => String(episode.seasonId) === String(season._id),
        ),
      })),
    };
  }

  async findOwnedKey(userId: string, r2Key: string): Promise<boolean> {
    const userIdObj = new Types.ObjectId(userId);
    const [item, episode] = await Promise.all([
      this.libraryItems.exists({ userId: userIdObj, r2Key }),
      this.episodes.exists({ userId: userIdObj, r2Key }),
    ]);
    return item !== null || episode !== null;
  }

  async keyExists(r2Key: string): Promise<boolean> {
    const [item, episode] = await Promise.all([
      this.libraryItems.exists({ r2Key }),
      this.episodes.exists({ r2Key }),
    ]);
    return item !== null || episode !== null;
  }

  async findOwnedSubtitle(userId: string, subtitleKey: string): Promise<boolean> {
    const userIdObj = new Types.ObjectId(userId);
    const [item, episode] = await Promise.all([
      this.libraryItems.exists({ userId: userIdObj, subtitleKey }),
      this.episodes.exists({ userId: userIdObj, subtitleKey }),
    ]);
    return item !== null || episode !== null;
  }

  async findVideoForDownload(
    userId: string,
    itemType: 'movie' | 'episode',
    refId: string,
  ): Promise<{ r2Key: string; fileName: string; fileSize?: number }> {
    if (!Types.ObjectId.isValid(refId)) {
      throw new NotFoundException('Recurso no encontrado');
    }
    const userIdObj = new Types.ObjectId(userId);

    if (itemType === 'movie') {
      const item = await this.libraryItems
        .findOne({ _id: refId, userId: userIdObj, type: 'movie' })
        .exec();
      if (!item) {
        throw new NotFoundException('Recurso no encontrado');
      }
      return {
        r2Key: item.r2Key,
        fileName: `${item.title}.mp4`,
        fileSize: item.fileSize,
      };
    }

    const episode = await this.episodes
      .findOne({ _id: refId, userId: userIdObj })
      .exec();
    if (!episode) {
      throw new NotFoundException('Recurso no encontrado');
    }
    return {
      r2Key: episode.r2Key,
      fileName: `${episode.title}.mp4`,
      fileSize: episode.fileSize,
    };
  }
}
