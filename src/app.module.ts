import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { MongooseModule } from '@nestjs/mongoose';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { AuthModule } from './auth/auth.module.js';
import { JwtAuthGuard } from './auth/jwt-auth.guard.js';
import { MaintenanceModule } from './maintenance/maintenance.module.js';
import { UsersModule } from './users/users.module.js';
import { LibraryModule } from './library/library.module.js';
import { MediaModule } from './media/media.module.js';
import { ProgressModule } from './progress/progress.module.js';
import { DownloadsModule } from './downloads/downloads.module.js';
import { CommonModule } from './common/common.module.js';
import { InfraModule } from './infra/infra.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 100 }]),
    MongooseModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        uri: config.getOrThrow<string>('MONGODB_URI'),
      }),
    }),
    AuthModule,
    UsersModule,
    MaintenanceModule,
    LibraryModule,
    MediaModule,
    ProgressModule,
    DownloadsModule,
    CommonModule,
    InfraModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
  ],
})
export class AppModule {}
