import { Module } from '@nestjs/common';
import { R2Service } from './r2/r2.service.js';
import { TmdbModule } from './tmdb/tmdb.module.js';

@Module({
  imports: [TmdbModule],
  providers: [R2Service],
  exports: [R2Service, TmdbModule],
})
export class InfraModule {}
