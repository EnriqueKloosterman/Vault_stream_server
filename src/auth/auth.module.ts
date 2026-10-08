import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule, type JwtSignOptions } from '@nestjs/jwt';
import { LibraryModule } from '../library/library.module.js';
import { UsersModule } from '../users/users.module.js';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { JwtStrategy } from './jwt.strategy.js';

@Module({
  imports: [
    UsersModule,
    LibraryModule,
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const secret = config.getOrThrow<string>('JWT_SECRET');
        if (secret.length < 32) {
          throw new Error('JWT_SECRET debe tener al menos 32 caracteres');
        }
        const raw = config.get<string>('JWT_EXPIRES_IN') ?? '30m';
        if (!/^\d+(s|m|h|d)$/.test(raw)) {
          throw new Error(
            'JWT_EXPIRES_IN inválido: usa formato como 30m, 1h, 7d',
          );
        }
        return {
          secret,
          signOptions: {
            expiresIn: raw as JwtSignOptions['expiresIn'],
          },
        };
      },
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy],
  exports: [JwtModule],
})
export class AuthModule {}
