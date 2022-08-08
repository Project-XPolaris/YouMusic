import { HttpModule, Module } from '@nestjs/common';
import { MusicService } from './music.service';
import { MusicController } from './music.controller';
import { MetaModule } from '../meta/meta.module';
import { ThumbnailModule } from '../thumbnail/thumbnail.module';
import { StorageModule } from '../storage/storage.module';
import { StorageService } from '../storage/storage.service';
import { ConfigModule } from '@nestjs/config/dist/config.module';

@Module({
  controllers: [MusicController],
  providers: [MusicService, StorageService],
  imports: [
    HttpModule,
    MetaModule,
    ThumbnailModule,
    StorageModule,
    ConfigModule,
  ],
})
export class MusicModule {}
