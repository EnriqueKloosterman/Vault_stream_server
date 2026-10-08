import {
  createParamDecorator,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';

export interface AuthUser {
  userId: string;
  email: string;
}

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthUser => {
    const user = ctx.switchToHttp().getRequest<{ user?: AuthUser }>().user;
    if (!user?.userId) {
      throw new UnauthorizedException('No autenticado');
    }
    return user;
  },
);
