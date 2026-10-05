import { Body, Controller, Get, Patch, Post, Query } from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { ProgressBodyDto, ProgressQueryDto } from './dto/progress.dto.js';
import { ProgressService } from './progress.service.js';

@Controller('progress')
export class ProgressController {
  constructor(private readonly progressService: ProgressService) {}

  @Get()
  list(
    @CurrentUser() user: { userId: string },
    @Query() query: ProgressQueryDto,
  ) {
    return this.progressService.list(user.userId, query.itemType, query.refId);
  }

  @Post()
  save(
    @CurrentUser() user: { userId: string },
    @Body() body: ProgressBodyDto,
  ) {
    return this.progressService.apply(user.userId, body);
  }

  @Patch()
  patch(
    @CurrentUser() user: { userId: string },
    @Body() body: ProgressBodyDto,
  ) {
    return this.progressService.apply(user.userId, body);
  }
}
