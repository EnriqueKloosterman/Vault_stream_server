import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { InfraModule } from '../infra/infra.module.js';
import { LibraryController } from './library.controller.js';
import { LibraryService } from './library.service.js';
import { Episode, EpisodeSchema } from './schemas/episode.schema.js';
import {
  LibraryItem,
  LibraryItemSchema,
} from './schemas/library-item.schema.js';
import { Season, SeasonSchema } from './schemas/season.schema.js';
import { Series, SeriesSchema } from './schemas/series.schema.js';
import { ScannerService } from './scanner.service.js';
import { SeriesController } from './series.controller.js';

@Module({
  imports: [
    InfraModule,
    MongooseModule.forFeature([
      { name: LibraryItem.name, schema: LibraryItemSchema },
      { name: Series.name, schema: SeriesSchema },
      { name: Season.name, schema: SeasonSchema },
      { name: Episode.name, schema: EpisodeSchema },
    ]),
  ],
  controllers: [LibraryController, SeriesController],
  providers: [LibraryService, ScannerService],
  exports: [LibraryService, ScannerService],
})
export class LibraryModule {}
