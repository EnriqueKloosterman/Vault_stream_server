import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { PresignDto, SubtitleQueryDto } from './dto/media.dto.js';
import { MediaService } from './media.service.js';

@Controller('media')
export class MediaController {
  constructor(private readonly mediaService: MediaService) {}

  @Post('presign')
  presign(
    @CurrentUser() user: { userId: string },
    @Body() dto: PresignDto,
  ): Promise<{ url: string; expiresIn: number }> {
    return this.mediaService.presign(user.userId, dto.r2Key);
  }

  @Get('subtitle')
  subtitle(
    @CurrentUser() user: { userId: string },
    @Query() query: SubtitleQueryDto,
  ): Promise<{ url: string; expiresIn: number }> {
    return this.mediaService.subtitle(user.userId, query.subtitleKey);
  }
}
