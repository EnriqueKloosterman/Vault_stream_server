import { Controller, Delete, Get } from '@nestjs/common';
import {
  CurrentUser,
  type AuthUser,
} from '../common/decorators/current-user.decorator.js';
import { MaintenanceService } from '../maintenance/maintenance.service.js';

@Controller('users')
export class UsersController {
  constructor(private readonly maintenanceService: MaintenanceService) {}

  @Get('me')
  me(@CurrentUser() user: AuthUser): { id: string; email: string } {
    return { id: user.userId, email: user.email };
  }

  @Delete('me')
  deleteMe(@CurrentUser() user: AuthUser): Promise<{ deleted: boolean }> {
    return this.maintenanceService.cascadeDeleteUser(user.userId);
  }
}