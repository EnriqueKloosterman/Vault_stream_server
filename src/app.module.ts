import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { AuthModule } from './auth/auth.module.js';
import { UsersModule } from './users/users.module.js';
import { LibraryModule } from './library/library.module.js';
import { MediaModule } from './media/media.module.js';
import { PlayerModule } from './player/player.module.js';
import { DownloadsModule } from './downloads/downloads.module.js';
import { CommonModule } from './common/common.module.js';
import { InfraModule } from './infra/infra.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    MongooseModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        uri: config.get<string>('MONGODB_URI'),
      }),
    }),
    AuthModule,
    UsersModule,
    LibraryModule,
    MediaModule,
    PlayerModule,
    DownloadsModule,
    CommonModule,
    InfraModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
