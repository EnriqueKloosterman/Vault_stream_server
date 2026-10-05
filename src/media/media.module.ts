import { Module } from '@nestjs/common';
import { InfraModule } from '../infra/infra.module.js';
import { LibraryModule } from '../library/library.module.js';
import { MediaController } from './media.controller.js';
import { MediaService } from './media.service.js';

@Module({
  imports: [LibraryModule, InfraModule],
  controllers: [MediaController],
  providers: [MediaService],
})
export class MediaModule {}
