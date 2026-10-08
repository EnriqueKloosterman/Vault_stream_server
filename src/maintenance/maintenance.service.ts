import { BadRequestException, Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Download } from '../downloads/schemas/download.schema.js';
import { Episode } from '../library/schemas/episode.schema.js';
import { LibraryItem } from '../library/schemas/library-item.schema.js';
import { Season } from '../library/schemas/season.schema.js';
import { Series } from '../library/schemas/series.schema.js';
import { WatchProgress } from '../progress/schemas/watch-progress.schema.js';
import { User } from '../users/schemas/user.schema.js';

@Injectable()
export class MaintenanceService implements OnApplicationBootstrap {
  private readonly logger = new Logger(MaintenanceService.name);

  constructor(
    @InjectModel(User.name) private readonly users: Model<User>,
    @InjectModel(LibraryItem.name)
    private readonly libraryItems: Model<LibraryItem>,
    @InjectModel(Series.name) private readonly series: Model<Series>,
    @InjectModel(Season.name) private readonly seasons: Model<Season>,
    @InjectModel(Episode.name) private readonly episodes: Model<Episode>,
    @InjectModel(Download.name) private readonly downloads: Model<Download>,
    @InjectModel(WatchProgress.name)
    private readonly watchProgress: Model<WatchProgress>,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    // Después del boot: barre huérfanos sin bloquear el arranque.
    setImmediate(() => {
      void this.removeOrphans().catch((e: unknown) => {
        this.logger.error('removeOrphans falló', e as Error);
      });
    });
  }

  async cascadeDeleteUser(userId: string): Promise<{ deleted: boolean }> {
    if (!Types.ObjectId.isValid(userId)) {
      throw new BadRequestException('userId inválido');
    }
    const userIdObj = new Types.ObjectId(userId);
    const filter = { userId: userIdObj };

    await Promise.all([
      this.episodes.deleteMany(filter).exec(),
      this.seasons.deleteMany(filter).exec(),
      this.series.deleteMany(filter).exec(),
      this.libraryItems.deleteMany(filter).exec(),
      this.downloads.deleteMany(filter).exec(),
      this.watchProgress.deleteMany(filter).exec(),
    ]);

    const user = await this.users.findByIdAndDelete(userId).exec();
    return { deleted: user !== null };
  }

  async removeOrphans(): Promise<number> {
    const rawUserIds = (await this.users
      .distinct('_id')
      .exec()) as unknown as Types.ObjectId[];
    if (rawUserIds.length === 0) {
      // $nin:[] matchearía TODOS los documentos -> no borrar nada.
      return 0;
    }
    const validIds = rawUserIds.map((id) => new Types.ObjectId(id));
    const filter = { userId: { $nin: validIds } };

    const [items, series, seasons, episodes, downloads, progress] =
      await Promise.all([
        this.libraryItems.deleteMany(filter).exec(),
        this.series.deleteMany(filter).exec(),
        this.seasons.deleteMany(filter).exec(),
        this.episodes.deleteMany(filter).exec(),
        this.downloads.deleteMany(filter).exec(),
        this.watchProgress.deleteMany(filter).exec(),
      ]);

    const total = [items, series, seasons, episodes, downloads, progress].reduce(
      (sum, result) => sum + (result.deletedCount ?? 0),
      0,
    );
    if (total > 0) {
      this.logger.log(`Datos huérfanos eliminados: ${total}`);
    }
    return total;
  }
}