import { Module } from '@nestjs/common';
import { DownloadsController } from './downloads.controller.js';
import { DownloadsService } from './downloads.service.js';

@Module({
  controllers: [DownloadsController],
  providers: [DownloadsService]
})
export class DownloadsModule {}
