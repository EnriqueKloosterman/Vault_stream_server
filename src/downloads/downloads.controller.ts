import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import {
  DownloadCompleteDto,
  DownloadProgressDto,
  StartDownloadDto,
} from './dto/downloads.dto.js';
import { DownloadsService } from './downloads.service.js';

@Controller('downloads')
export class DownloadsController {
  constructor(private readonly downloadsService: DownloadsService) {}

  @Get()
  list(@CurrentUser() user: { userId: string }) {
    return this.downloadsService.list(user.userId);
  }

  @Post('start')
  start(
    @CurrentUser() user: { userId: string },
    @Body() dto: StartDownloadDto,
  ) {
    return this.downloadsService.start(user.userId, dto);
  }

  @Patch(':id/progress')
  progress(
    @CurrentUser() user: { userId: string },
    @Param('id') id: string,
    @Body() dto: DownloadProgressDto,
  ) {
    return this.downloadsService.updateProgress(user.userId, id, dto.progressPct);
  }

  @Patch(':id/complete')
  complete(
    @CurrentUser() user: { userId: string },
    @Param('id') id: string,
    @Body() dto: DownloadCompleteDto,
  ) {
    return this.downloadsService.complete(user.userId, id, dto.fileSize);
  }

  @Delete(':id')
  remove(@CurrentUser() user: { userId: string }, @Param('id') id: string) {
    return this.downloadsService.remove(user.userId, id);
  }
}
