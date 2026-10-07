import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Download, DownloadSchema } from '../downloads/schemas/download.schema.js';
import { Episode, EpisodeSchema } from '../library/schemas/episode.schema.js';
import {
  LibraryItem,
  LibraryItemSchema,
} from '../library/schemas/library-item.schema.js';
import { Season, SeasonSchema } from '../library/schemas/season.schema.js';
import { Series, SeriesSchema } from '../library/schemas/series.schema.js';
import {
  WatchProgress,
  WatchProgressSchema,
} from '../progress/schemas/watch-progress.schema.js';
import { User, UserSchema } from '../users/schemas/user.schema.js';
import { MaintenanceService } from './maintenance.service.js';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: User.name, schema: UserSchema },
      { name: LibraryItem.name, schema: LibraryItemSchema },
      { name: Series.name, schema: SeriesSchema },
      { name: Season.name, schema: SeasonSchema },
      { name: Episode.name, schema: EpisodeSchema },
      { name: Download.name, schema: DownloadSchema },
      { name: WatchProgress.name, schema: WatchProgressSchema },
    ]),
  ],
  providers: [MaintenanceService],
  exports: [MaintenanceService],
})
export class MaintenanceModule {}