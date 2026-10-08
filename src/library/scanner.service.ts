import {
  BadRequestException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { R2Service, type R2Object } from '../infra/r2/r2.service.js';
import { EnrichmentService } from './enrichment.service.js';
import { classifyVideo, escapeRegex, subtitleKeyFor } from './parser.js';
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

interface SeenKeys {
  episodeKeys: Set<string>;
  itemKeys: Set<string>;
}

function normalizeSeriesTitle(title: string): string {
  return title
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function normalizePrefix(raw: string): string | null {
  const clean = raw.trim().replace(/^\/+/, '').replace(/\/+$/, '');
  if (clean.length === 0 || clean.length > 200) {
    return null;
  }
  if (clean.includes('..') || clean.includes('\\') || clean.includes('\n')) {
    return null;
  }
  if (!/^[A-Za-z0-9 _\-./()]+$/.test(clean)) {
    return null;
  }
  return clean;
}

const MAX_STATUSES = 5000;

@Injectable()
export class ScannerService {
  private readonly logger = new Logger(ScannerService.name);
  private readonly statuses = new Map<string, ScanStatus>();
  private readonly locks = new Set<string>();

  constructor(
    private readonly r2: R2Service,
    private readonly config: ConfigService,
    private readonly enrichment: EnrichmentService,
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

  private setStatus(userId: string, status: ScanStatus): void {
    if (this.statuses.size >= MAX_STATUSES && !this.statuses.has(userId)) {
      const oldest = this.statuses.keys().next().value;
      if (oldest !== undefined) {
        this.statuses.delete(oldest);
      }
    }
    this.statuses.set(userId, status);
  }

  async scan(
    userId: string,
    prefixes?: string[],
  ): Promise<{ status: 'started' }> {
    if (!Types.ObjectId.isValid(userId)) {
      throw new BadRequestException('userId inválido');
    }
    if (this.locks.has(userId) || this.getStatus(userId).scanning) {
      return { status: 'started' };
    }
    const roots = this.resolveRoots(prefixes);
    this.locks.add(userId);
    this.setStatus(userId, { scanning: true, processed: 0 });
    void this.runScan(userId, roots)
      .catch((error: unknown) => {
        this.logger.error(`scan falló para ${userId}: ${String(error)}`);
        const current = this.getStatus(userId);
        this.setStatus(userId, {
          scanning: false,
          processed: current.processed ?? 0,
          total: current.total,
          lastScanAt: new Date(),
        });
      })
      .finally(() => {
        this.locks.delete(userId);
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

  private resolveRoots(prefixes?: string[]): string[] {
    const normalizeAll = (list: string[]): string[] => {
      const out: string[] = [];
      for (const raw of list) {
        const clean = normalizePrefix(raw);
        if (clean !== null && !out.includes(clean)) {
          out.push(clean);
        }
      }
      return out;
    };

    if (prefixes && prefixes.length > 0) {
      const requested = normalizeAll(prefixes);
      const allowed = this.r2.prefixes;
      const filtered = requested.filter((prefix) =>
        allowed.some(
          (root) => prefix === root || prefix.startsWith(`${root}/`),
        ),
      );
      if (filtered.length === 0) {
        throw new BadRequestException(
          'Ningún prefijo está permitido para este escaneo',
        );
      }
      return filtered;
    }
    return [...this.r2.prefixes];
  }

  async runScan(userId: string, prefixes?: string[]): Promise<void> {
    if (!Types.ObjectId.isValid(userId)) {
      throw new BadRequestException('userId inválido');
    }
    const roots =
      prefixes !== undefined ? this.resolveRoots(prefixes) : this.resolveRoots(undefined);
    if (roots.length === 0) {
      this.logger.warn(`runScan sin raíces para ${userId}: revisa R2_PREFIXES`);
      this.setStatus(userId, {
        scanning: false,
        processed: 0,
        total: 0,
        lastScanAt: new Date(),
      });
      return;
    }

    const objects: R2Object[] = [];
    for (const root of roots) {
      try {
        objects.push(...(await this.r2.listAll(root)));
      } catch (error) {
        this.logger.error(`listAll falló para "${root}": ${String(error)}`);
        throw error;
      }
    }

    const videos = objects.filter((object) => /\.mp4$/i.test(object.key));
    const subtitleList = objects
      .filter((object) => /\.srt$/i.test(object.key))
      .map((object) => object.key);
    const subtitleIndex = new Map<string, string>();
    for (const key of subtitleList) {
      const base = key
        .replace(/\.[a-z0-9]{2,4}$/i, '')
        .toLowerCase();
      if (!subtitleIndex.has(base)) {
        subtitleIndex.set(base, key);
      }
    }
    const skipped = objects.length - videos.length - subtitleList.length;
    if (skipped > 0) {
      this.logger.debug(
        `scan ${userId}: ${skipped} objetos ignorados (solo mp4/srt)`,
      );
    }

    const status: ScanStatus = {
      scanning: true,
      processed: 0,
      total: videos.length,
    };
    this.setStatus(userId, status);

    const userIdObj = new Types.ObjectId(userId);
    const seen: SeenKeys = { episodeKeys: new Set(), itemKeys: new Set() };
    for (const video of videos) {
      try {
        await this.upsertVideo(userIdObj, video, subtitleList, seen);
      } catch (error) {
        this.logger.warn(
          `upsert falló para "${video.key}": ${String(error)}`,
        );
      }
      status.processed += 1;
    }

    await this.pruneStale(userIdObj, roots, seen);

    status.scanning = false;
    status.lastScanAt = new Date();
    void this.enrichment
      .enrichUserLibrary(userId)
      .catch((error: unknown) => {
        this.logger.warn(`enriquecimiento falló: ${String(error)}`);
      });
  }

  private async pruneStale(
    userId: Types.ObjectId,
    roots: string[],
    seen: SeenKeys,
  ): Promise<void> {
    const rootPattern = roots
      .map((root) => escapeRegex(root.trim().replace(/\/+$/, '')))
      .filter((pattern) => pattern.length > 0)
      .join('|');
    if (rootPattern.length === 0) {
      return;
    }
    const rootRe = new RegExp(`^(?:${rootPattern})(?:/|$)`);

    // $nin gigante supera 16MB BSON: si hay demasiadas claves vistas,
    // se omite el prune (conservador: nunca borra de más).
    const MAX_PRUNE_NIN = 5000;
    if (seen.itemKeys.size <= MAX_PRUNE_NIN) {
      await this.libraryItems.deleteMany({
        userId,
        r2Key: { $regex: rootRe, $nin: [...seen.itemKeys] },
      });
    } else {
      this.logger.warn(
        `prune omitido para libraryItems: ${seen.itemKeys.size} claves vistas`,
      );
    }
    if (seen.episodeKeys.size <= MAX_PRUNE_NIN) {
      await this.episodes.deleteMany({
        userId,
        r2Key: { $regex: rootRe, $nin: [...seen.episodeKeys] },
      });
    } else {
      this.logger.warn(
        `prune omitido para episodes: ${seen.episodeKeys.size} claves vistas`,
      );
    }

    const keptSeasonHex = new Set<string>(
      (
        (await this.episodes
          .distinct('seasonId', { userId })
          .exec()) as unknown as Types.ObjectId[]
      ).map((id) => String(id)),
    );
    if (keptSeasonHex.size > 0) {
      await this.seasons.deleteMany({
        userId,
        _id: {
          $nin: [...keptSeasonHex].map((id) =>
            Types.ObjectId.isValid(id) ? new Types.ObjectId(id) : id,
          ),
        },
      });
    } else {
      await this.seasons.deleteMany({ userId });
    }

    const keptSeriesHex = new Set<string>();
    for (const id of (await this.seasons
      .distinct('seriesId', { userId })
      .exec()) as unknown as Types.ObjectId[]) {
      if (id) {
        keptSeriesHex.add(String(id));
      }
    }
    for (const id of (await this.libraryItems
      .distinct('seriesId', { userId, seriesId: { $exists: true } })
      .exec()) as unknown as Types.ObjectId[]) {
      if (id) {
        keptSeriesHex.add(String(id));
      }
    }
    if (keptSeriesHex.size > 0) {
      await this.series.deleteMany({
        userId,
        _id: {
          $nin: [...keptSeriesHex].map((id) =>
            Types.ObjectId.isValid(id) ? new Types.ObjectId(id) : id,
          ),
        },
      });
    } else {
      await this.series.deleteMany({ userId });
    }
  }

  private async upsertVideo(
    userId: Types.ObjectId,
    video: R2Object,
    subtitleKeys: string[],
    seen: SeenKeys,
  ): Promise<void> {
    const parsed = classifyVideo(video.key);
    const subtitleKey = subtitleKeyFor(video.key, subtitleKeys);

    if (parsed.kind === 'series') {
      const normalized = normalizeSeriesTitle(parsed.seriesTitle);
      const seriesDoc = await this.series.findOneAndUpdate(
        { userId, normalizedTitle: normalized },
        {
          $set: {
            userId,
            title: parsed.seriesTitle,
            normalizedTitle: normalized,
            year: parsed.year,
            r2Prefix:
              parsed.folderPath.length > 0 ? `${parsed.folderPath}/` : undefined,
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

      const episodeUpdate: Record<string, unknown> = {
        userId,
        seasonId: seasonDoc._id,
        seriesId: seriesDoc._id,
        title: parsed.episodeTitle,
        number: parsed.episode,
        episodeNumber: parsed.episode,
        r2Key: video.key,
        fileSize: video.size,
      };
      if (subtitleKey !== undefined) {
        episodeUpdate.subtitleKey = subtitleKey;
      }
      await this.episodes.findOneAndUpdate(
        { userId, r2Key: video.key },
        {
          $set: episodeUpdate,
          ...(subtitleKey === undefined
            ? { $unset: { subtitleKey: 1 } }
            : {}),
          $setOnInsert: {
            watched: false,
            progressSec: 0,
            lastPos: 0,
          },
        },
        { upsert: true },
      );
      seen.episodeKeys.add(video.key);

      // Una fila por serie (determinista por seriesId), no por carpeta.
      const seriesRowKey = `series/${String(seriesDoc._id)}/`;
      await this.libraryItems.findOneAndUpdate(
        { userId, r2Key: seriesRowKey },
        {
          $set: {
            userId,
            seriesId: seriesDoc._id,
            type: 'series',
            title: parsed.seriesTitle,
            year: parsed.year,
            r2Key: seriesRowKey,
            folderPath: parsed.folderPath,
            format: 'mp4',
          },
          $setOnInsert: {
            watched: false,
          },
        },
        { upsert: true },
      );
      seen.itemKeys.add(seriesRowKey);
      return;
    }

    const movieUpdate: Record<string, unknown> = {
      userId,
      type: 'movie',
      title: parsed.title,
      year: parsed.year,
      r2Key: video.key,
      folderPath: parsed.folderPath,
      fileSize: video.size,
      format: 'mp4',
    };
    if (subtitleKey !== undefined) {
      movieUpdate.subtitleKey = subtitleKey;
    }
    await this.libraryItems.findOneAndUpdate(
      { userId, r2Key: video.key },
      {
        $set: movieUpdate,
        ...(subtitleKey === undefined ? { $unset: { subtitleKey: 1 } } : {}),
        $setOnInsert: {
          watched: false,
        },
      },
      { upsert: true },
    );
    seen.itemKeys.add(video.key);
  }
}
