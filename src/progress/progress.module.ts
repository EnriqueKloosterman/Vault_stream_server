import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ProgressController } from './progress.controller.js';
import { ProgressService } from './progress.service.js';
import {
  WatchProgress,
  WatchProgressSchema,
} from './schemas/watch-progress.schema.js';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: WatchProgress.name, schema: WatchProgressSchema },
    ]),
  ],
  controllers: [ProgressController],
  providers: [ProgressService],
})
export class ProgressModule {}
