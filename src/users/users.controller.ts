import { Controller, Get } from '@nestjs/common';
import {
  CurrentUser,
  type AuthUser,
} from '../common/decorators/current-user.decorator.js';

@Controller('users')
export class UsersController {
  @Get('me')
  me(@CurrentUser() user: AuthUser): { id: string; email: string } {
    return { id: user.userId, email: user.email };
  }
}
