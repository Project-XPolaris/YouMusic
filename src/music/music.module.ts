import { HttpModule, Module } from '@nestjs/common';
import { MusicService } from './music.service';
import { MusicController } from './music.controller';
import { MetaModule } from '../meta/meta.module';
import { ThumbnailModule } from '../thumbnail/thumbnail.module';
import { StorageModule } from '../storage/storage.module';
import { StorageService } from '../storage/storage.service';
import { ConfigModule } from '@nestjs/config/dist/config.module';
import { LogModule } from '../log/log.module';
import { LogService } from '../log/log.service';

@Module({
  controllers: [MusicController],
  providers: [MusicService],
  imports: [
    LogModule,
    HttpModule,
    MetaModule,
    ThumbnailModule,
    StorageModule,
    ConfigModule,
  ],
})
export class MusicModule {}
