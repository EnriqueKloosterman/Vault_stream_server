import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { R2Service, type R2Object } from '../infra/r2/r2.service.js';
import { classifyVideo, subtitleKeyFor } from './parser.js';
import { Episode } from './schemas/episode.schema.js';
import { LibraryItem } from './schemas/library-item.schema.js';
import { Season } from './schemas/season.schema.js';
import { Series } from './schemas/series.schema.js';

export interface ScanStatus {
  scanning: boolean;
  processed: number;
  total?: number;
  lastScanAt?: Date;
}

@Injectable()
export class ScannerService {
  private readonly statuses = new Map<string, ScanStatus>();

  constructor(
    private readonly r2: R2Service,
    private readonly config: ConfigService,
    @InjectModel(LibraryItem.name)
    private readonly libraryItems: Model<LibraryItem>,
    @InjectModel(Series.name) private readonly series: Model<Series>,
    @InjectModel(Season.name) private readonly seasons: Model<Season>,
    @InjectModel(Episode.name) private readonly episodes: Model<Episode>,
  ) {}

  getStatus(userId: string): ScanStatus {
    return (
      this.statuses.get(userId) ?? { scanning: false, processed: 0 }
    );
  }

  async scan(
    userId: string,
    prefixes?: string[],
  ): Promise<{ status: 'started' }> {
    const current = this.getStatus(userId);
    if (current.scanning) {
      return { status: 'started' };
    }
    this.statuses.set(userId, { scanning: true, processed: 0 });
    void this.runScan(userId, prefixes).catch(() => {
      this.statuses.set(userId, {
        scanning: false,
        processed: 0,
        lastScanAt: new Date(),
      });
    });
    return { status: 'started' };
  }

  async scanAuto(userId: string): Promise<void> {
    const enabled =
      (this.config.get<string>('SCAN_AUTO_ON_LOGIN') ?? 'true') === 'true';
    if (!enabled) {
      return;
    }
    await this.scan(userId);
  }

  async runScan(userId: string, prefixes?: string[]): Promise<void> {
    const roots =
      prefixes && prefixes.length > 0 ? prefixes : this.r2.prefixes;
    const objects: R2Object[] = [];
    for (const root of roots) {
      objects.push(...(await this.r2.listAll(root)));
    }

    const videos = objects.filter((object) => /\.mp4$/i.test(object.key));
    const subtitles = objects
      .filter((object) => /\.srt$/i.test(object.key))
      .map((object) => object.key);

    const status: ScanStatus = {
      scanning: true,
      processed: 0,
      total: videos.length,
    };
    this.statuses.set(userId, status);

    const userIdObj = new Types.ObjectId(userId);
    for (const video of videos) {
      await this.upsertVideo(userIdObj, video, subtitles);
      status.processed += 1;
    }

    status.scanning = false;
    status.lastScanAt = new Date();
  }

  private async upsertVideo(
    userId: Types.ObjectId,
    video: R2Object,
    subtitleKeys: string[],
  ): Promise<void> {
    const parsed = classifyVideo(video.key);
    const subtitleKey = subtitleKeyFor(video.key, subtitleKeys);

    if (parsed.kind === 'series') {
      const seriesDoc = await this.series.findOneAndUpdate(
        { userId, title: parsed.seriesTitle },
        {
          $setOnInsert: {
            userId,
            title: parsed.seriesTitle,
            year: parsed.year,
            r2Prefix: parsed.folderPath.length > 0 ? `${parsed.folderPath}/` : undefined,
          },
        },
        { upsert: true, returnDocument: 'after' },
      );

      const seasonDoc = await this.seasons.findOneAndUpdate(
        { userId, seriesId: seriesDoc._id, number: parsed.season },
        {
          $setOnInsert: {
            userId,
            seriesId: seriesDoc._id,
            number: parsed.season,
          },
        },
        { upsert: true, returnDocument: 'after' },
      );

      await this.episodes.findOneAndUpdate(
        { userId, r2Key: video.key },
        {
          $set: {
            userId,
            seasonId: seasonDoc._id,
            seriesId: seriesDoc._id,
            title: parsed.episodeTitle,
            number: parsed.episode,
            episodeNumber: parsed.episode,
            r2Key: video.key,
            subtitleKey,
            fileSize: video.size,
          },
          $setOnInsert: {
            watched: false,
            progressSec: 0,
            lastPos: 0,
          },
        },
        { upsert: true },
      );

      const seriesRowKey =
        parsed.folderPath.length > 0
          ? `${parsed.folderPath}/`
          : `series/${parsed.seriesTitle}/`;
      await this.libraryItems.findOneAndUpdate(
        { userId, r2Key: seriesRowKey },
        {
          $set: {
            userId,
            seriesId: seriesDoc._id,
          },
          $setOnInsert: {
            type: 'series',
            title: parsed.seriesTitle,
            year: parsed.year,
            r2Key: seriesRowKey,
            folderPath: parsed.folderPath,
            format: 'mp4',
            watched: false,
          },
        },
        { upsert: true },
      );
      return;
    }

    await this.libraryItems.findOneAndUpdate(
      { userId, r2Key: video.key },
      {
        $set: {
          userId,
          type: 'movie',
          title: parsed.title,
          year: parsed.year,
          r2Key: video.key,
          folderPath: parsed.folderPath,
          subtitleKey,
          fileSize: video.size,
          format: 'mp4',
        },
        $setOnInsert: {
          watched: false,
        },
      },
      { upsert: true },
    );
  }
}
