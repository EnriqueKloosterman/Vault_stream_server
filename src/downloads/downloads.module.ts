import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { InfraModule } from '../infra/infra.module.js';
import { LibraryModule } from '../library/library.module.js';
import { DownloadsController } from './downloads.controller.js';
import { DownloadsService } from './downloads.service.js';
import { Download, DownloadSchema } from './schemas/download.schema.js';

@Module({
  imports: [
    LibraryModule,
    InfraModule,
    MongooseModule.forFeature([{ name: Download.name, schema: DownloadSchema }]),
  ],
  controllers: [DownloadsController],
  providers: [DownloadsService],
})
export class DownloadsModule {}
