import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { LibraryQueryDto, ScanDto } from './dto/library-query.dto.js';
import { LibraryService } from './library.service.js';
import { ScannerService, type ScanStatus } from './scanner.service.js';

@Controller('library')
export class LibraryController {
  constructor(
    private readonly libraryService: LibraryService,
    private readonly scannerService: ScannerService,
  ) {}

  @Get()
  list(@CurrentUser() user: { userId: string }, @Query() query: LibraryQueryDto) {
    return this.libraryService.list(user.userId, {
      page: query.page ?? 1,
      limit: query.limit ?? 20,
      type: query.type,
      q: query.q,
    });
  }

  @Post('scan')
  scan(
    @CurrentUser() user: { userId: string },
    @Body() dto: ScanDto,
  ): Promise<{ status: 'started' }> {
    return this.scannerService.scan(user.userId, dto.prefixes);
  }

  @Get('status')
  status(@CurrentUser() user: { userId: string }): ScanStatus {
    return this.scannerService.getStatus(user.userId);
  }
}
