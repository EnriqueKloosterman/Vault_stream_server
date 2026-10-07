import { Module } from '@nestjs/common';
import { TmdbService } from './tmdb.service.js';

@Module({
  providers: [TmdbService],
  exports: [TmdbService],
})
export class TmdbModule {}