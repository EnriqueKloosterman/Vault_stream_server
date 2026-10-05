import { Controller, Get, Param } from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { LibraryService } from './library.service.js';

@Controller('series')
export class SeriesController {
  constructor(private readonly libraryService: LibraryService) {}

  @Get(':id')
  detail(
    @CurrentUser() user: { userId: string },
    @Param('id') id: string,
  ) {
    return this.libraryService.seriesDetail(user.userId, id);
  }
}
